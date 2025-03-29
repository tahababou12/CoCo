import os
import io
import base64
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Any

import torch
import numpy as np
import modal
from PIL import Image
from fastapi import UploadFile, File, Form

# Define Modal image with CUDA support - using Ubuntu 22.04 with CUDA 11.8
image = modal.Image.from_registry(
    "nvidia/cuda:11.8.0-cudnn8-devel-ubuntu22.04",
    setup_dockerfile_commands=[
        "ENV DEBIAN_FRONTEND=noninteractive",
        # Install Python and basic dependencies
        "RUN apt-get update && apt-get install -y git build-essential cmake ninja-build python3 python3-pip",
        # Make sure python3 is the default python
        "RUN ln -sf /usr/bin/python3 /usr/bin/python",
        "RUN python --version",
        
        # Install PyTorch with CUDA 11.8 support
        "RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118",
        
        # Install FastAPI for web endpoints
        "RUN pip install fastapi[standard]",
    ],
)

# Clone TRELLIS repo and run setup script to install all dependencies
image = image.run_commands(
    # Clone the repository with all submodules
    "git clone --recurse-submodules https://github.com/microsoft/TRELLIS.git",
    
    # Debug: List TRELLIS directory to verify setup.sh exists
    "cd /TRELLIS && ls -la",
    
    # Make sure Python can find the TRELLIS module
    "echo 'export PYTHONPATH=$PYTHONPATH:/TRELLIS' >> ~/.bashrc",
    "export PYTHONPATH=$PYTHONPATH:/TRELLIS",
    
    "cd /TRELLIS && ./setup.sh --basic --xformers --flash-attn --diffoctreerast --spconv --mipgaussian --kaolin --nvdiffrast",
)

# Create Modal app
app = modal.App("trellis", image=image)

# Set environment variables
@app.cls(gpu="A100:8", cpu=32, memory=262144, timeout=3600)
class Trellis:
    def __init__(self):
        # Set CUDA as preferred device
        torch.set_default_device('cuda')
        torch.set_default_tensor_type('torch.cuda.FloatTensor')
        
        os.environ['ATTN_BACKEND'] = 'xformers'  # As recommended in the README for compatibility
        os.environ['SPCONV_ALGO'] = 'native'     # As recommended in the README for one-time runs
        os.environ['CUDA_VISIBLE_DEVICES'] = '0,1,2,3,4,5,6,7'  # Ensure all 8 GPUs are visible
        os.environ['PYTHONPATH'] = f"{os.environ.get('PYTHONPATH', '')}:/TRELLIS"  # Make sure Python finds the TRELLIS module
        
        # Force CUDA to be preferred for all operations
        os.environ['CUDA_DEVICE_ORDER'] = 'PCI_BUS_ID'
        os.environ['CUDA_LAUNCH_BLOCKING'] = '1'  # More synchronous execution for better stability
        
        print(f"CUDA initialization: available={torch.cuda.is_available()}, device_count={torch.cuda.device_count()}")
        print(f"Default CUDA device: {torch.cuda.current_device()}")

    @modal.enter()
    def load_model(self):
        from trellis.pipelines import TrellisImageTo3DPipeline
        import torch.distributed as dist
        
        # Set up multi-GPU environment
        print(f"CUDA available: {torch.cuda.is_available()}")
        print(f"Number of GPUs: {torch.cuda.device_count()}")
        for i in range(torch.cuda.device_count()):
            print(f"GPU {i}: {torch.cuda.get_device_name(i)}")
        
        # Load the pipeline from Hugging Face as recommended in the README
        self.pipeline = TrellisImageTo3DPipeline.from_pretrained("JeffreyXiang/TRELLIS-image-large")
        
        # Distribute model across GPUs if multiple GPUs are available
        if torch.cuda.device_count() > 1:
            # Stage 1: Sparse Structure VAE
            self.pipeline.sparse_structure_vae.encoder.to('cuda:0')
            self.pipeline.sparse_structure_vae.decoder.to('cuda:1')
            
            # Stage 2: SLat VAE
            self.pipeline.slat_vae.encoder.to('cuda:2')
            
            # Decoders - spread across different GPUs
            self.pipeline.slat_vae.decoders['gaussian'].to('cuda:3')
            self.pipeline.slat_vae.decoders['radiance_field'].to('cuda:4')
            self.pipeline.slat_vae.decoders['mesh'].to('cuda:5')
            
            # Flow models
            self.pipeline.sparse_structure_sampler.model.to('cuda:6')
            self.pipeline.slat_sampler.model.to('cuda:7')
            
            print("Model distributed across 8 GPUs")
        else:
            # Fall back to single GPU
            self.pipeline.cuda()
            print("Model loaded on single GPU")
        
        # Pre-compile for faster first run
        print("Running warm-up pass...")
        dummy_img = Image.new('RGB', (512, 512), color='white')
        self.pipeline.run(
            dummy_img, 
            seed=1,
            sparse_structure_sampler_params={"steps": 1},
            slat_sampler_params={"steps": 1},
        )
        torch.cuda.empty_cache()
        print("Model loaded and warm-up complete")

    @modal.method()
    def generate_3d(
        self, 
        image_bytes: bytes,
        output_format: str = "glb",
        seed: int = 42,
        ss_steps: int = 24,  # Increased steps for better quality
        ss_cfg_strength: float = 7.5,
        slat_steps: int = 24,  # Increased steps for better quality
        slat_cfg_strength: float = 3.0,
    ) -> Dict[str, Any]:
        """Generate 3D model from input image with maximum quality"""
        from trellis.utils import render_utils, postprocessing_utils
        import imageio.v3 as imageio
        
        # Load image from bytes
        image = Image.open(io.BytesIO(image_bytes))
        
        print(f"Beginning generation with {ss_steps} sparse structure steps and {slat_steps} SLat steps")
        
        # With 8 GPUs we can use maximum quality settings
        outputs = self.pipeline.run(
            image,
            seed=seed,
            sparse_structure_sampler_params={
                "steps": ss_steps,
                "cfg_strength": ss_cfg_strength,
            },
            slat_sampler_params={
                "steps": slat_steps,
                "cfg_strength": slat_cfg_strength,
            },
        )
        
        print("Generation complete, preparing outputs")
        results = {}
        
        # Generate high quality preview videos with more frames
        if "gaussian" in outputs:
            render_options = {"num_frames": 120, "resolution": 1024}  # 120 frames for smoother rotation, higher resolution
            print("Rendering Gaussian video...")
            video = render_utils.render_video(outputs['gaussian'][0], **render_options)['color']
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                imageio.imwrite(f.name, video, fps=60)  # Higher FPS for smoother playback
                with open(f.name, "rb") as video_file:
                    results["gaussian_video"] = base64.b64encode(video_file.read()).decode("utf-8")
                os.unlink(f.name)
        
        if "radiance_field" in outputs:
            render_options = {"num_frames": 120, "resolution": 1024}
            print("Rendering Radiance Field video...")
            video = render_utils.render_video(outputs['radiance_field'][0], **render_options)['color']
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                imageio.imwrite(f.name, video, fps=60)
                with open(f.name, "rb") as video_file:
                    results["rf_video"] = base64.b64encode(video_file.read()).decode("utf-8")
                os.unlink(f.name)
        
        if "mesh" in outputs:
            render_options = {"num_frames": 120, "resolution": 1024}
            print("Rendering Mesh video...")
            video = render_utils.render_video(outputs['mesh'][0], **render_options)['normal']
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                imageio.imwrite(f.name, video, fps=60)
                with open(f.name, "rb") as video_file:
                    results["mesh_video"] = base64.b64encode(video_file.read()).decode("utf-8")
                os.unlink(f.name)
        
        # Export 3D model in requested format with maximum quality settings
        if output_format == "glb":
            print("Exporting GLB...")
            glb = postprocessing_utils.to_glb(
                outputs['gaussian'][0],
                outputs['mesh'][0],
                simplify=0.85,  # Even less simplification for higher quality
                texture_size=4096,  # Maximum texture resolution
            )
            with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
                glb.export(f.name)
                with open(f.name, "rb") as glb_file:
                    results["model"] = base64.b64encode(glb_file.read()).decode("utf-8")
                    results["model_format"] = "glb"
                os.unlink(f.name)
        
        elif output_format == "ply":
            print("Exporting PLY...")
            with tempfile.NamedTemporaryFile(suffix=".ply", delete=False) as f:
                # Export with maximum quality settings
                outputs['gaussian'][0].save_ply(f.name, optimize_points=True)
                with open(f.name, "rb") as ply_file:
                    results["model"] = base64.b64encode(ply_file.read()).decode("utf-8")
                    results["model_format"] = "ply"
                os.unlink(f.name)
        
        print("All outputs prepared")
        # Return base64 encoded results
        return results

    @modal.method()
    def health_check(self) -> Dict[str, str]:
        """Simple health check endpoint"""
        return {
            "status": "ok", 
            "model": "TRELLIS-image-large",
            "gpu_count": torch.cuda.device_count(),
            "gpu_names": [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
        }

@app.function()
@modal.fastapi_endpoint(method="GET")
def health():
    trellis = Trellis()
    return trellis.health_check.remote()

@app.function()
@modal.fastapi_endpoint(method="POST")
async def generate(
    image: UploadFile = File(...),
    output_format: str = Form("glb"),
    seed: int = Form(42),
    ss_steps: int = Form(24),
    ss_cfg_strength: float = Form(7.5),
    slat_steps: int = Form(24),
    slat_cfg_strength: float = Form(3.0)
):
    """Generate 3D model from input image"""
    trellis = Trellis()
    image_bytes = await image.read()
    
    result = trellis.generate_3d.remote(
        image_bytes, 
        output_format=output_format,
        seed=seed,
        ss_steps=ss_steps,
        ss_cfg_strength=ss_cfg_strength,
        slat_steps=slat_steps,
        slat_cfg_strength=slat_cfg_strength,
    )
    
    return result

if __name__ == "__main__":
    modal.runner.deploy_app(app) 
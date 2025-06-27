#!/usr/bin/env python3
"""
Script to fix indentation issues in Python files.
This script converts tabs to spaces and ensures consistent 4-space indentation.
"""

import os
import re
import sys
from pathlib import Path

def fix_indentation_in_file(file_path):
    """Fix indentation issues in a single Python file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Convert tabs to spaces (4 spaces per tab)
        content = content.expandtabs(4)
        
        # Split into lines
        lines = content.split('\n')
        fixed_lines = []
        
        for line in lines:
            # Count leading spaces
            leading_spaces = len(line) - len(line.lstrip())
            
            # Ensure indentation is a multiple of 4
            if leading_spaces > 0:
                # Round down to nearest multiple of 4
                proper_indent = (leading_spaces // 4) * 4
                fixed_line = ' ' * proper_indent + line.lstrip()
            else:
                fixed_line = line
            
            fixed_lines.append(fixed_line)
        
        # Join lines back together
        fixed_content = '\n'.join(fixed_lines)
        
        # Write back to file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        
        print(f"✅ Fixed indentation in {file_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error fixing {file_path}: {e}")
        return False

def find_python_files(directory):
    """Find all Python files in the given directory and subdirectories."""
    python_files = []
    for root, dirs, files in os.walk(directory):
        # Skip virtual environments and common directories to avoid
        dirs[:] = [d for d in dirs if d not in ['venv', '__pycache__', '.git', 'node_modules']]
        
        for file in files:
            if file.endswith('.py'):
                python_files.append(os.path.join(root, file))
    
    return python_files

def main():
    """Main function to fix indentation in all Python files."""
    # Get the directory to process (default to current directory)
    target_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    
    print(f"🔧 Fixing indentation in Python files in: {target_dir}")
    
    # Find all Python files
    python_files = find_python_files(target_dir)
    
    if not python_files:
        print("No Python files found.")
        return
    
    print(f"Found {len(python_files)} Python files to process.")
    
    # Fix each file
    success_count = 0
    for file_path in python_files:
        if fix_indentation_in_file(file_path):
            success_count += 1
    
    print(f"\n🎉 Fixed indentation in {success_count}/{len(python_files)} files.")
    
    # Test if the files are valid Python
    print("\n🧪 Testing Python syntax...")
    invalid_files = []
    
    for file_path in python_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                compile(f.read(), file_path, 'exec')
        except SyntaxError as e:
            print(f"❌ Syntax error in {file_path}: {e}")
            invalid_files.append(file_path)
        except Exception as e:
            print(f"❌ Error testing {file_path}: {e}")
            invalid_files.append(file_path)
    
    if not invalid_files:
        print("✅ All Python files have valid syntax!")
    else:
        print(f"❌ {len(invalid_files)} files still have syntax errors.")

if __name__ == "__main__":
    main() 
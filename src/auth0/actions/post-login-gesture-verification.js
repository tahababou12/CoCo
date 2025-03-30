exports.onExecutePostLogin = async (event, api) => {
  const hasParentalConsent = event.user.app_metadata?.parental_consent;
  const userAge = event.user.app_metadata?.user_age;
  const isParentAccount = event.user.app_metadata?.is_parent_account;
  const lastLoginTime = event.user.app_metadata?.last_login_time;
  const dailyDrawingTime = event.user.app_metadata?.daily_drawing_time || 0;
  const contentRestrictions = event.user.app_metadata?.content_restrictions || {
    safe_search: true,
    inappropriate_content_filter: true,
    sharing_enabled: false
  };
  const drawingHistory = event.user.app_metadata?.drawing_history || [];
  const totalDrawings = event.user.app_metadata?.total_drawings || 0;
  const lastDrawingDate = event.user.app_metadata?.last_drawing_date;
  const achievements = event.user.app_metadata?.achievements || [];
  const drawingStreak = event.user.app_metadata?.drawing_streak || 0;
  const currentTime = new Date().toISOString();

  const isUnderAge = userAge && userAge < 13;
  const requiresParentalConsent = isUnderAge && !hasParentalConsent;
  const isNewDay = lastLoginTime && 
    new Date(lastLoginTime).toDateString() !== new Date(currentTime).toDateString();
  const updatedDrawingTime = isNewDay ? 0 : dailyDrawingTime;
  const isStreakActive = lastDrawingDate && 
    new Date().toDateString() === new Date(new Date(lastDrawingDate).getTime() + 86400000).toDateString();
  const updatedStreak = isStreakActive ? drawingStreak : 0;

  api.accessToken.setCustomClaim('requires_parental_consent', requiresParentalConsent);
  api.accessToken.setCustomClaim('is_parent_account', isParentAccount);
  api.accessToken.setCustomClaim('user_age_group', isUnderAge ? 'child' : 'teen');
  api.accessToken.setCustomClaim('daily_drawing_time', updatedDrawingTime);
  api.accessToken.setCustomClaim('can_draw', updatedDrawingTime < 120);
  api.accessToken.setCustomClaim('content_settings', contentRestrictions);
  api.accessToken.setCustomClaim('drawing_stats', {
    total_drawings: totalDrawings,
    last_drawing: lastDrawingDate,
    history_length: drawingHistory.length
  });
  api.accessToken.setCustomClaim('achievements', {
    total: achievements.length,
    streak: updatedStreak,
    unlocked: achievements
  });

  api.user.setAppMetadata('parental_controls', {
    has_consent: hasParentalConsent,
    user_age: userAge,
    is_parent: isParentAccount,
    requires_consent: requiresParentalConsent
  });
  api.user.setAppMetadata('drawing_limits', {
    daily_time: updatedDrawingTime,
    last_login: currentTime,
    can_draw: updatedDrawingTime < 120
  });
  api.user.setAppMetadata('safety_settings', {
    ...contentRestrictions,
    last_updated: currentTime
  });
  api.user.setAppMetadata('drawing_progress', {
    history: drawingHistory,
    total: totalDrawings,
    last_drawing: lastDrawingDate
  });
  api.user.setAppMetadata('achievement_data', {
    achievements: achievements,
    streak: updatedStreak,
    last_update: currentTime
  });
}; 
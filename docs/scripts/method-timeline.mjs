// One shared clock: completed stages hold their last frame; later stages wait at 0.
export function stageStartTime(stages, index) {
  if (!Number.isInteger(index) || index < 0 || index >= stages.length) throw new RangeError('Invalid stage index');
  return stages.slice(0, index).reduce((sum, stage) => sum + (stage.playbackFrames ?? stage.frames) / stage.fps, 0);
}

export function sequenceState(stages, elapsed) {
  let start = 0;
  return stages.map(stage => {
    const duration = (stage.playbackFrames ?? stage.frames) / stage.fps;
    const local = Math.max(0, elapsed - start);
    const active = elapsed >= start && elapsed < start + duration;
    const complete = elapsed >= start + duration;
    start += duration;
    return {
      frame: Math.min((stage.playbackFrames ?? stage.frames) - 1, Math.floor(local * stage.fps + 1e-7)),
      progress: Math.min(1, local / duration), active, complete,
    };
  });
}

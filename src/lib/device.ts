/** A phone or a tablet. iPads say they are Macs, so a Mac with a touch screen counts as one. */
export function isHandheld(): boolean {
  const agent = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

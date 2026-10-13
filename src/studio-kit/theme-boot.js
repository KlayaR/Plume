// StudioKit v2.1.0, generated copy: edit in audio/StudioKit, then run npm run sync-kit
(function () {
  var p = 'auto'
  try { p = localStorage.getItem('studiokit.theme') || 'auto' } catch {}
  if (p !== 'dark' && p !== 'light') p = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = p
})()

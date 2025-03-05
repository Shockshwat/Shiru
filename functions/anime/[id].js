// this is a bit scuffed, but these are cf pages redirect functions

/** @type {PagesFunction} */
export function onRequest ({ params }) {
  try {
    const id = Number(params.id)
    if (Number.isSafeInteger(id)) {
      const html = /* html */`
<!DOCTYPE html>
<html style=background:#000>
  <head>
    <meta http-equiv=refresh content="5; url=https://shiru.watch">
    <meta property="og:title" content="Anime">
    <meta property="og:description" content="BitTorrent streaming software with no paws in the way—watch anime in real-time, no waiting for downloads!">
    <meta property="og:site_name" content="Shiru">
    <meta property="og:image" content=https://shiru.watch/app_original.png>
    <meta property="og:url" content=shiru://anime/${id}>
    <meta data-vmid="twitter:card" name="twitter:card" content="summary_large_image">
    <meta name="theme-color" content="#17191C">
  </head>
  <body>
    <iframe src=shiru://anime/${id} style=border:none></iframe>Redirecting...
  </body>
</html>`

      return new Response(html, {
        headers: {
          'content-type': 'text/html;charset=UTF-8'
        }
      })
    }
  } catch (e) {}
  return Response.redirect('https://shiru.watch/')
}

<div class='card bg-dark p-15 d-flex mx-0 overflow-hidden mb-10 mt-0'>
  <div class='d-flex pl-10 flex-column justify-content-between w-full h-100' style='min-width: 0;'>
    <div class='d-flex w-full'>
      <div class='skeloader h-25 w-250 mw-full rounded bg-dark-light'><div class='skeleloader-swipe' /></div>
    </div>
    <div class='skeloader h-10 w-150 mw-full rounded bg-dark-light'><div class='skeleloader-swipe' /></div>
    <div class='metadata-container d-flex flex-row w-full'>
      <div class='skeloader h-10 w-300 mw-full rounded bg-dark-light'>
        <div class='skeleloader-swipe' />
      </div>
      <div class='skeloader h-10 w-150 mw-full rounded bg-dark-light ml-auto secondary-metadata'>
        <div class='skeleloader-swipe' />
      </div>
      </div>
  </div>
</div>

<style>
  /* Behavior for narrow screens (mobile) */
  @media (max-width: 35rem) {
    .metadata-container {
      flex-direction: column  !important;
    }
    .secondary-metadata {
      margin-left: 0 !important;
      margin-top: 1rem;
      justify-content: flex-start !important;
    }
  }
</style>

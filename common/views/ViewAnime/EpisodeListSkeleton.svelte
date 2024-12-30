<div class='rounded w-full h-full overflow-hidden d-flex flex-xsm-column flex-row pointer position-relative bg-dark'>
  <div class='h-full bg-dark-light'>
    <div class='skeleloader-swipe img-cover h-full w-266'></div>
  </div>
  <div class='h-full w-full px-20 py-15 d-flex flex-column'>
    <div class='w-full d-flex flex-row mb-20 mt-0 title'>
      <div class='skeloader episode-title w-full bg-dark-light h-25 rounded'>
        <div class='skeleloader-swipe'></div>
      </div>
      <div class='skeloader ml-auto bg-dark-light w-30 h-25 rounded flex-shrink-0'>
        <div class='skeleloader-swipe'></div>
      </div>
    </div>
    <div class='skeloader bg-dark-light w-full h-10 overflow-hidden rounded'>
      <div class='skeleloader-swipe'></div>
    </div>
    <div class='skeloader n-description bg-dark-light w-full h-10 overflow-hidden rounded'>
      <div class='skeleloader-swipe'></div>
    </div>
    <div class='skeloader description bg-dark-light w-full h-10 overflow-hidden rounded'>
      <div class='skeleloader-swipe'></div>
    </div>
    <div class='skeloader description bg-dark-light w-full h-10 overflow-hidden rounded'>
      <div class='skeleloader-swipe'></div>
    </div>
    <div class='skeloader description bg-dark-light w-full h-10 overflow-hidden rounded'>
      <div class='skeleloader-swipe'></div>
    </div>
    <div class='skeloader bg-dark-light h-10 rounded pt-10 mt-20 date'>
      <div class='skeleloader-swipe'></div>
    </div>
  </div>
</div>

<style>
  .w-266 {
    width: 26.6rem !important;
  }
  .w-30 {
    width: 3rem !important;
  }
  .episode-title {
    max-width: 40rem !important;
    margin-right: 4rem;
  }
  .n-description {
    margin-top: 0.8rem;
  }
  .description {
    margin-top: 0.8rem;
    display: none;
  }
  .date{
    max-width: 10rem !important;
  }

  /* Behavior for narrow screens (mobile) */
  @media (max-width: 470px) {
    .flex-xsm-column {
      flex-direction: column !important;
    }
    .description {
      display: block !important;
    }
    .title {
      margin-top: .5rem !important;
    }
    .date {
      margin-bottom: 3rem !important;
    }
    .img-cover {
      width: 100% !important;
      height: 15rem !important;
    }
  }
</style>

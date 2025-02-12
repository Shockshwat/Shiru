<script>
  export let promise
</script>

{#await promise then res}
  {#if !res || res?.errors}
    <div class='p-20 d-flex align-items-center justify-content-center w-full h-410'>
      <div>
        <h1 class='mb-5 text-white font-weight-bold text-center'>
          Ooops!
        </h1>
        {#if res?.errors}
          <div class='font-size-20 text-center text-muted'>
            Looks like something went wrong!
          </div>
        {/if}
        <div class='font-size-20 text-center text-muted'>
          {#if !res?.errors}
            Looks like there's nothing here.
          {:else}
            {res?.errors[0]?.message}
          {/if}
        </div>
      </div>
    </div>
  {/if}
{:catch error}
  <div class='p-20 d-flex align-items-center justify-content-center w-full h-410'>
    <div>
      <h1 class='mb-5 text-white font-weight-bold text-center'>
        Ooops!
      </h1>
      <div class='font-size-20 text-center text-muted'>
        Looks like something went wrong!
      </div>
      <div class='font-size-20 text-center text-muted'>
        {error.message}
      </div>
    </div>
  </div>
{/await}

<style>
  .h-410 {
    height: 41rem;
  }
</style>

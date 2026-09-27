<script lang="ts">
  const params = new URLSearchParams(window.location.search);
  const msg = params.get("msg") ?? "";
</script>

<div
  class="w-full h-full bg-black text-white flex items-center justify-center p-3 text-center whitespace-pre-line"
>
  {msg}
</div>

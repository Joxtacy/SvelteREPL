<script lang="ts">
    import Input from "./Input.svelte";
    import Output from "./Output.svelte";
    import type { Component } from "./types";
    import { codeStore } from "./stores";

    let current: number = 0;
    let compiled: string;

    const worker = new Worker("./worker.js");

    worker.addEventListener("message", (event: MessageEvent<string>) => {
        compiled = event.data;
    })

    function compile(_components: Component[]): void {
        worker.postMessage(_components);
    }

    $: compile($codeStore);

</script>

<style>
</style>

<main>
    <Input bind:components={$codeStore} bind:current />
    <Output {compiled} />
</main>

<script lang="ts">
    import type { Component } from "./types";
    import { codeStore, tabsStore } from "./stores";
    import Input from "./Input.svelte";
    import Output from "./Output.svelte";
    import Tabs from "./Tabs.svelte";

    let current: number = 0;
    let compiled: string;

    const worker = new Worker("./worker.js");

    worker.addEventListener("message", (event: MessageEvent<string>) => {
        compiled = event.data;
    });

    function compile(_components: Component[]): void {
        worker.postMessage(_components);
    }

    function deleteComponent(deleteId: number) {
        current = 0; // reset back to App.svelte
        $codeStore = $codeStore.filter(({ id }) => id !== deleteId);
    }

    function getMax(_components: Component[]): number {
        const ids = _components.map(({ id }) => id);
        return Math.max(...ids);
    }

    function newComponent() {
        const id = getMax($codeStore) + 1;

        $codeStore = $codeStore.concat({
            id,
            name: `Component${id}`,
            type: "svelte",
            source: "",
        });

        current = id;
    }

    $: compile($codeStore);
</script>

<style>
    main {
        display: grid;
        grid-template-areas:
            "tabs tabs"
            "input output";
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 50px 1fr;
        gap: 5px;
    }

    .tabs {
        grid-area: tabs;
        justify-self: start;
        align-self: start;
        overflow-x: scroll;
        width: 100%;
        height: 100%;
    }

    .input {
        grid-area: input;
    }

    .output {
        grid-area: output;
    }
</style>

<main>
    <div class="tabs">
        <Tabs
            tabs={$tabsStore}
            {current}
            on:select={({ detail }) => (current = detail)}
            on:new={newComponent}
            on:del={({ detail }) => deleteComponent(detail)} />
    </div>
    <div class="input">
        <Input bind:components={$codeStore} bind:current />
    </div>
    <div class="output">
        <Output {compiled} />
    </div>
</main>

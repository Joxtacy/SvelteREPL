<script lang="ts">
    import type { Component } from "./types";
    import Tabs from "./Tabs.svelte";

    export let components: Component[] = [];
    export let current: number = 0;

    let textarea: HTMLTextAreaElement;

    $: currentComponentId = components.findIndex(({ id }) => id === current);
    $: tabs = components.map(({ id, name, type }) => ({ id, name, type }));

    function keydownHandler(event: KeyboardEvent) {
        if (event.key == "Tab") {
            event.preventDefault();
            var start = textarea.selectionStart;
            var end = textarea.selectionEnd;

            // set textarea value to: text before caret + tab + text after caret
            const spaceTab = `    `;
            textarea.value =`${textarea.value.substring(0, start)}${spaceTab}${textarea.value.substring(end)}`;

            // put caret at right position again
            textarea.selectionStart = textarea.selectionEnd = start + spaceTab.length;
        }
    }

    function getMax(_components: Component[]): number {
        const ids = _components.map(({ id }) => id);
        return Math.max(...ids);
    }

    function newComponent() {
        const id = getMax(components) + 1;

        components = components.concat({
            id,
            name: `Component${id}`,
            type: "svelte",
            source: `<script>
<\/script>

<style>
<\/style>`,
        });

        current = id;
        textarea.focus();
    }
</script>

<section>
    <Tabs
        {tabs}
        {current}
        on:select={({ detail }) => (current = detail)}
        on:new={newComponent} />
    <textarea
        on:keydown={keydownHandler}
        bind:value={components[currentComponentId].source}
        bind:this={textarea} />
</section>

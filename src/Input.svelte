<script lang="ts">
    import type { Component } from "./types";

    export let components: Component[] = [];
    export let current: number = 0;

    let textarea: HTMLTextAreaElement;

    $: currentComponentId = components.findIndex(({ id }) => id === current);
    $: if (currentComponentId > -1 && textarea) textarea.focus();

    function keydownHandler(event: KeyboardEvent) {
        if (event.key == "Tab") {
            event.preventDefault();
            var start = textarea.selectionStart;
            var end = textarea.selectionEnd;

            // set textarea value to: text before caret + tab + text after caret
            const spaceTab = `    `;
            textarea.value = `${textarea.value.substring(
                0,
                start
            )}${spaceTab}${textarea.value.substring(end)}`;

            // put caret at right position again
            textarea.selectionStart = textarea.selectionEnd =
                start + spaceTab.length;
        }
    }
</script>

<section>
    <textarea
        on:keydown={keydownHandler}
        bind:value={components[currentComponentId].source}
        bind:this={textarea} />
</section>

<style>
    section {
        width: 100%;
    }
</style>
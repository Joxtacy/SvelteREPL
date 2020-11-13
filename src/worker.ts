import type { Component } from "./types";

import * as rollup from "rollup/dist/es/rollup.browser.js";

const CDN_URL = "https://cdn.jsdelivr.net/npm";

importScripts(`${CDN_URL}/svelte/compiler.js`);

const componentLookup = new Map<string, Component>();

function generateLookup(components: Component[]): void {
    componentLookup.clear();
    components.forEach((component) => {
        componentLookup.set(`./${component.name}.${component.type}`, component);
    });
}

async function fetchPackage(url: string): Promise<string> {
    return (await fetch(url)).text();
}

self.addEventListener(
    "message",
    async (event: MessageEvent<Component[]>): Promise<void> => {
        generateLookup(event.data);

        const bundle = await rollup.rollup({
            input: "./App.svelte",
            plugins: [
                {
                    name: "repl-plugin",
                    resolveId(importee: string, importer: string) {
                        // import x from "svelte"
                        if (importee === "svelte") {
                            return `${CDN_URL}/svelte/index.mjs`;
                        }

                        // import y from "svelte/y"
                        if (importee.startsWith("svelte")) {
                            return `${CDN_URL}/svelte/${importee.slice(
                                7
                            )}/index.mjs`;
                        }

                        // import z from "./file.js"
                        if (
                            importer &&
                            importer.startsWith(`${CDN_URL}/svelte`)
                        ) {
                            const resolved = new URL(importee, importer).href;
                            if (resolved.endsWith(".mjs")) {
                                return resolved;
                            }
                            return `${resolved}/index.mjs`;
                        }

                        // REPL components
                        if (componentLookup.has(importee)) {
                            return importee;
                        }
                    },
                    async load(id: string) {
                        if (componentLookup.has(id)) {
                            return componentLookup.get(id).source;
                        }
                        return await fetchPackage(id);
                    },
                    transform(code: string, id: string) {
                        if (/.*\.svelte/.test(id)) {
                            // @ts-ignore
                            return svelte.compile(code).js.code;
                        }
                    },
                },
            ],
        });

        const output = (await bundle.generate({ format: "esm" })).output[0]
            .code;

        self.postMessage(output, "*");
    }
);

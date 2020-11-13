import svelte from "rollup-plugin-svelte";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import livereload from "rollup-plugin-livereload";
import sveltePreprocess from "svelte-preprocess";
import typescript from "@rollup/plugin-typescript";
import herp from "./src/rollup-plugin-html-thingy";

const yep = herp();

const production = !process.env.ROLLUP_WATCH;

const onwarn = ({ message }) =>
    message.includes("@rollup/plugin-typescript TS2315");

function serve() {
    let server;

    function toExit() {
        if (server) server.kill(0);
    }

    return {
        writeBundle() {
            if (server) return;
            server = require("child_process").spawn(
                "npm",
                ["run", "start", "--", "--dev"],
                {
                    stdio: ["ignore", "inherit", "inherit"],
                    shell: true,
                }
            );

            process.on("SIGTERM", toExit);
            process.on("exit", toExit);
        },
    };
}

export default [
    {
        preserveEntrySignatures: false,
        input: "src/index.ts",
        output: {
            sourcemap: production ? false : true,
            format: "iife",
            name: "app",
            dir: production ? "dist" : "public",
            entryFileNames: production ? "[name]-[hash].js" : "index.js",
        },
        plugins: [
            production ? yep() : undefined,
            svelte({
                dev: !production,
                css: (css) => {
                    css.write(css.filename);
                },
                preprocess: sveltePreprocess(),
            }),

            resolve({
                browser: true,
                dedupe: ["svelte"],
            }),
            commonjs(),
            typescript(),
            !production && serve(),
            !production && livereload("public"),
        ],
        watch: {
            clearScreen: false,
        },
        onwarn,
    },
    {
        preserveEntrySignatures: false,
        input: "src/worker.ts",
        output: {
            sourcemap: production ? false : true,
            format: "esm",
            name: "app",
            dir: production ? "dist" : "public",
            entryFileNames: "worker.js",
        },
        plugins: [
            production ? yep() : undefined,
            resolve({
                browser: true,
                dedupe: ["svelte"],
            }),
            commonjs(),
            typescript(),
        ],
        watch: {
            clearScreen: false,
        },
        onwarn,
    },
];

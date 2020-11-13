export default function (template) {
    let handlers = [];
    let i = 0;
    function addHandler() {
        i++;
    }

    function removeHandler(rollup, bundle) {
        handlers.push(bundle);
        i--;
        if (i === 0) {
            let files = [];
            handlers.forEach((handler) => {
                const keys = Object.keys(handler);
                keys.forEach((fileName) => {
                    const chunk = handler[fileName];
                    files.push(chunk.fileName);
                });

                files = files.filter(
                    (fileName) =>
                        fileName !== "worker.js" &&
                        (fileName.endsWith(".js") || fileName.endsWith(".css"))
                );
            });

            const scripts = files.reduce((accumulator, fileName) => {
                if (fileName.endsWith(".js")) {
                    accumulator += `<script src="./${fileName}"></script>`;
                } else {
                    accumulator += `<link rel="stylesheet" href="./${fileName}" />`;
                }
                accumulator += "\n";
                return accumulator;
            }, "");

            rollup.emitFile({
                type: "asset",
                fileName: "index.html",
                source: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Title</title>
${scripts}
</head>
<body>
</body>
</html>
`,
            });
        }
    }

    return function () {
        addHandler();

        return {
            generateBundle(options, bundle, isWrite) {
                removeHandler(this, bundle);
            },
        };
    };
}

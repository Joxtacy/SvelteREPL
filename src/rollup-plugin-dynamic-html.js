export default function dynamicHtml() {
    return {
        generateBundle(options, bundle, isWrite) {
            const bundleKeys = Object.keys(bundle);
            let scripts = "";
            bundleKeys.forEach((fileName) => {
                const chunk = bundle[fileName];
                const script = `<script src="./${chunk.fileName}"></script>`;
                scripts += script;
                scripts += "\n";
            });
            this.emitFile({
                type: "asset",
                fileName: "derp.html",
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
        },
    };
}

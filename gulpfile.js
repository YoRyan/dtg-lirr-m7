import { writeFile } from "fs/promises";
import gulp from "gulp";
const { dest, src, watch } = gulp;
import { stream } from "gulp-execa";
import filter from "gulp-filter";
import flatmap from "gulp-flatmap";
import intermediate from "gulp-intermediate";
import rename from "gulp-rename";
import path from "path";
import ts from "typescript";
import tstl from "typescript-to-lua";

export default async function() {
    watch(["src/mod/**/*.ts", "src/lib/**/*.ts"], scripts);
}

export async function scripts() {
    return awaitStream(
        src("src/mod/**/*.ts", { base: "src" })
            .pipe(
                flatmap(function (stream, file) {
                    return stream
                        .pipe(src(["src/@types/**/*", "src/lib/**/*.ts"], { base: "src" }))
                        .pipe(
                            src(["node_modules/lua-types/**/*", "node_modules/typescript-to-lua/**/*"], { base: "." })
                        )
                        .pipe(
                            intermediate({}, async function (tempDir, cb) {
                                await transpileTypeScriptToLua(tempDir, file.relative);
                                cb();
                            })
                        )
                        .pipe(filter(["mod/**/*.lua"]));
                })
            )
            // Need to pipe through cat because node pipes can't be referenced with
            // named file descriptors; see https://stackoverflow.com/a/72906798
            .pipe(stream(({ path }) => `luac -o /dev/stdout ${path} | cat`, { shell: true }))
            .pipe(rename(path => (path.extname = ".out")))
            .pipe(rename(path => (path.dirname = path.dirname.replace(/^mod\//, ""))))
            .pipe(dest("dist"))
    );
}

async function transpileTypeScriptToLua(tempDir, luaPath) {
    // We need the root tsconfig.json node to set the value of "include".
    const tsconfig = path.join(tempDir, "tsconfig.json");
    await writeFile(tsconfig, `{ "include": ["${path.join(tempDir, "@types")}", "${path.join(tempDir, "mod")}"] }`);

    const result = tstl.transpileProject(tsconfig, {
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        types: ["lua-types/5.0"],
        strict: true,
        typeRoots: [path.join(tempDir, "@types")],
        luaTarget: tstl.LuaTarget.Lua50,
        luaLibImport: tstl.LuaLibImportKind.Inline,
        sourceMapTraceback: false,
        luaBundle: path.join(path.dirname(luaPath), path.basename(luaPath, ".ts") + ".lua"),
        // The entry path needs to be absolute so that TSTL sets the correct module name.
        luaBundleEntry: path.join(tempDir, luaPath),
    });
    printDiagnostics(result.diagnostics);
}

function printDiagnostics(diagnostics) {
    console.log(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
            getCanonicalFileName: f => f,
            getNewLine: () => "\n",
        })
    );
}

async function awaitStream(stream) {
    return new Promise((resolve, reject) => {
        stream.on("finish", resolve).on("error", reject);
    });
}

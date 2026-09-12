const fs=require("node:fs");
const ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>{
 const {outputText}=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}});
 module._compile(outputText,filename);
};
require.extensions[".tsx"]=require.extensions[".ts"];


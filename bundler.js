const fs = require('fs');
const path = require('path');
const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const babel = require('babel-core');

let ID = 0;

function createAsset(fileName) {
    const content = fs.readFileSync(fileName, 'utf8');
    const ast = babylon.parse(content, {
        sourceType: 'module'
    });
    const dependencies = [];

    traverse(ast, {
        ImportDeclaration: ({node}) => {
            dependencies.push(node.source.value);
        }
    });

    const id = ID++;

    const {code} = babel.transformFromAst(ast, null, {
        presets: ['env']
    });

    return {
        id,
        fileName,
        dependencies,
        code
    };
}

function createGraph(entry){
    const mainAsset = createAsset(entry);
    const queue = [mainAsset];

    for(let asset of queue){
        const dirname = path.dirname(asset.fileName);

        asset.mapping = {};

        asset.dependencies.forEach(relativePath => {
            const absolutePath = path.join(dirname, relativePath);

            const child = createAsset(absolutePath);

            asset.mapping[relativePath] = child.id;

            queue.push(child);
        });
    }
    
    return queue;
}

function bundle(graph, id){
    let modules = '';

    graph.forEach(mod => {
        modules += `${mod.id}: [
            function (require, module, exports) { ${mod.code} },
            ${JSON.stringify(mod.mapping)}            
        ],
        `;
    });

    const result = `
        (function (modules) {
            function require(id) {
                const [fn, mapping] = modules[id];

                function localRequire(rel) {
                    return require(mapping[rel]);
                }

                const module = { exports: {} };

                fn(localRequire, module, module.exports);
                return module.exports;
            }

            require(${id});
        })({${modules}})
    `;

    return result;
}

let graph = createGraph('./example/entry.js');
let result = bundle(graph, 0);

const file = path.join(__dirname, 'bundle.js');

fs.writeFile(file, result, 'utf8', (err) => {
    if(err) console.log(err);
    console.log('The file has been writed');
});

graph.map(item => {
    let fileName = item.fileName;

    fs.watchFile(fileName, (curr, prev) => {
        graph = createGraph('./example/entry.js');
        result = bundle(graph, graph[0].id);

        console.log(`${fileName} has been changed`);

        fs.writeFile(file, result, 'utf8', (err) => {
            if(err) console.log(err);
            console.log('The file has been writed');
        });
    });
})

// fs.watchFile(file, (curr, prev) => {
//     console.log('The file has been changed');
//     fs.writeFile(file, result, 'utf8', (err) => {
//         if(err) console.log(err);
//         console.log('The file has been writed');
//     });
// });

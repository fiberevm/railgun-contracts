const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../..");
const sourceRoot = fs.realpathSync(
  path.join(root, "scripts/ephemeral/aave-vault")
);
const input = require("../../deployments/fusdt0/compiler-input.json");
for (const [name, { content }] of Object.entries(input.sources)) {
  const target = path.resolve(sourceRoot, name);
  assert(
    target.startsWith(`${sourceRoot}/`),
    `Unexpected source path: ${name}`
  );
  if (fs.existsSync(target)) {
    assert.equal(
      fs.readFileSync(target, "utf8"),
      content,
      `Source differs: ${name}`
    );
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

const forgeStd = path.join(sourceRoot, "lib/forge-std");
if (!fs.existsSync(forgeStd)) {
  assert(
    fs.existsSync(
      path.join(sourceRoot, "lib/createx/lib/forge-std/src/Test.sol")
    ),
    "Initialize source submodules first"
  );
  fs.symlinkSync("createx/lib/forge-std", forgeStd);
}
console.log(
  `Restored and checked ${
    Object.keys(input.sources).length
  } canonical source files.`
);

const fs = require('fs');
const path = require('path');

// Adjusted path: script is in apps/frontend/scripts/, package.json is in apps/frontend/
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const pinnedDeps = [
    'next',
    'eslint-config-next',
    '@shopify/app-bridge',
    '@shopify/app-bridge-react'
];
let hasError = false;

console.log(`Verifying pinned dependencies in ${packageJsonPath}...`);

pinnedDeps.forEach(dep => {
    const version = packageJson.dependencies[dep] || packageJson.devDependencies[dep];
    if (!version) {
        // console.warn(`Warning: ${dep} not found in dependencies or devDependencies`);
        return;
    }

    if (version.startsWith('^') || version.startsWith('~')) {
        console.error(`ERROR: ${dep} version "${version}" is not pinned. Remove carets (^) or tildes (~).`);
        hasError = true;
    } else {
        console.log(`OK: ${dep} is pinned to "${version}"`);
    }
});

if (hasError) {
    process.exit(1);
} else {
    console.log('All checked dependencies are pinned.');
}

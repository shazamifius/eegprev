const globals = require("globals");
const pluginJs = require("@eslint/js");

module.exports = [
    {
        ignores: ["node_modules/", "public/", "uploads/", "**/refontgraphique/**"]
    },
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest
            },
            ecmaVersion: 2022,
            sourceType: "commonjs"
        }
    },
    pluginJs.configs.recommended,
    {
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "no-undef": "error"
        }
    }
];

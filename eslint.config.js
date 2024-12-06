const pagerConfig = require("@pager/eslint-config-ts");

module.exports = [
  ...pagerConfig.configs.recommended,
  {
    ignores: [
      'eslint.config.js',
      'lib/',
      'repos/',
    ],
  },
];

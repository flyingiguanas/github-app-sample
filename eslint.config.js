import pagerConfig from "@pager/eslint-config-ts";

export default [
  ...pagerConfig.configs.recommended,
  {
    ignores: [
      'eslint.config.js',
      'dist/',
      'repos/',
    ],
  },
];

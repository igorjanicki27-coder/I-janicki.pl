const purgecss = require('@fullhuman/postcss-purgecss');

module.exports = {
  plugins: [
    purgecss({
      content: [
        './*.html',
        './dokumenty/*.html',
        './stats/*.html',
        './*.js',
        './dokumenty/*.js',
      ],
      safelist: {
        // Klasy dodawane dynamicznie przez JS (toggle/add/remove)
        standard: [
          'is-active', 'is-done', 'is-current', 'is-pointing',
          'data-theme', 'show', 'hidden',
        ],
        // Wzorce klas generowanych dynamicznie
        greedy: [
          /^tut-/, /^bot-/, /^panel-/, /^modal-/, /^cookie-/,
          /^doc-/, /^review-/, /^stage-/, /^choice-/, /^pref-/,
          /^step-/, /^price-/, /^svc-/, /^project-/, /^about-/,
          /^form-/, /^foot-/, /^bg-/, /^cursor-/, /^star/,
          /^loader/, /^spinner/, /^name-/, /^greeting-/,
          /^section-/, /^reviews-/, /^btn/, /^glow/, /^circle/,
          /^container-stars/, /^stars/, /[data-theme]/,
        ],
      },
      defaultExtractor: content =>
        content.match(/[\w-/:]+(?<!:)/g) || [],
    }),
    require('cssnano')({ preset: 'default' }),
  ],
};

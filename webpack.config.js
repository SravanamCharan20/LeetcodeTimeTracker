const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/js/background.js',
    content: './src/js/content.js',
    popup: './src/js/popup.js'
  },
  output: {
    filename: 'js/[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  chrome: '88'
                }
              }]
            ]
          }
        }
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/html', to: 'html' },
        { from: 'src/css', to: 'css' }
      ]
    })
  ],
  optimization: {
    minimize: false // Keeps the output readable for debugging
  },
  performance: {
    hints: false
  },
  resolve: {
    fallback: {
      "crypto": false,
      "buffer": false,
      "path": false,
      "fs": false
    }
  }
}; 
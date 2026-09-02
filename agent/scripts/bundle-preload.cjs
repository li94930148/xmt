const esbuild = require('esbuild');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
esbuild.buildSync({
  entryPoints:[path.join(root,'dist-desktop','desktop','preload.js')],
  outfile:path.join(root,'dist-desktop','desktop','preload.js'),
  bundle:true,
  format:'cjs',
  platform:'browser',
  target:'es2022',
  external:['electron'],
  allowOverwrite:true,
  legalComments:'none',
});

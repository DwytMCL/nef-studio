# NEF Studio

A browser-local Nikon NEF to PNG converter. Open the hosted site on an iPhone or desktop, choose NEF files, then convert and download. Photos stay in the browser and are never uploaded.

## Run locally

```sh
npm install
npm run dev
```

Build with `npm run build`. Serve `dist/` as a static site over HTTPS.

## Color and device limits

Processing uses LibRaw compiled to WebAssembly. The default uses the recorded camera white balance, available camera matrix, sRGB output, and disables automatic brightening. PNG files include an sRGB color-space chunk. This neutral RAW development is not an exact match for Nikon Picture Control or in-camera JPEG tone curves.

16-bit output requires substantially more memory. iPhone browsers may terminate a tab on very large NEFs or batches. Files are processed sequentially; try one image or half-size output if memory is limited. Some new or uncommon NEF compression schemes may not decode in this bundled LibRaw build.

# AGENTS.md

## Cursor Cloud specific instructions

This is a **C99** project (`rtl_433`) built with **CMake**. It is a radio signal decoder for ISM bands (433 MHz, 868 MHz, etc.) — there is no web frontend or database; the main artifact is a single C binary.

### Building

```bash
cmake -GNinja -B build
cmake --build build -j $(nproc)
```

RTL-SDR and SoapySDR hardware libraries are optional. The build works without them (file input and rtl_tcp still work). The build is configured with `-DENABLE_RTLSDR=ON` by default; `librtlsdr-dev` is installed in the VM. SoapySDR is not installed (not critical).

### Testing

```bash
cd build && ctest --output-on-failure
```

Tests include: `data-test`, `bitbuffer_test`, `fileformat_test`, `optparse_test`, `bit_util_test`, `rtl_433_help` (integration), and `style-check`. All 7 tests must pass.

### Style / lint check

The `style-check` test (included in CTest) checks code style across all `.c` and `.h` files. This is the project's lint equivalent. CI also runs `./tests/symbolizer.py check` for symbol errors, and `./maintainer_update.py` to verify generated files are up to date.

### Running the application

No SDR hardware is available in the VM. To test the binary, use the `-y` flag for inline test data decoding:

```bash
./build/src/rtl_433 -y "{25}fb2dd58"
```

This decodes test bitstrings against all enabled protocol decoders and outputs matches. Use `-F json` for JSON output. The built-in HTTP server can be started with `-F http` (serves on port 8433).

### Gotchas

- GCC 13.2.0+ enables `-fanalyzer` (static analysis) automatically via CMakeLists.txt, which significantly increases build time. The VM has Clang 18 as default compiler, which avoids this.
- `maintainer_update.py` regenerates `README.md` and `man/man1/rtl_433.1` based on the build configuration. If SoapySDR is not installed, it will produce a diff. This is expected and those changes should not be committed unless SoapySDR status actually changed.
- The separate `rtl_433_tests` repo (not included here) contains `.cu8` signal capture files for integration testing via `make test` in CI.

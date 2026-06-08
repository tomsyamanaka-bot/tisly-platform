set(PICO_BOARD_HEADER_DIRS ${CMAKE_CURRENT_LIST_DIR}/../boards)
set(PICO_BOARD waveshare_rp2350_eth_8di_8ro)

cmake_minimum_required(VERSION 3.12)
include(pico_sdk_import.cmake)
project(main)
pico_sdk_init()

# Add compilation subdirectory
add_subdirectory(lib/Config)
add_subdirectory(lib/Serial)

# Add header file directory
include_directories(lib/Config)
include_directories(lib/Serial)

add_executable(main 
    main.c
)

# enable usb output, disable uart output
pico_enable_stdio_usb(main 1)
pico_enable_stdio_uart(main 0)

# create map/bin/hex/uf2 file etc.
pico_add_extra_outputs(main)

target_link_libraries(main Serial Config pico_stdlib hardware_spi pico_stdlib)


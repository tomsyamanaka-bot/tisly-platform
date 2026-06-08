# Search for all source files in the current directory
# and save the names to the DIR_Serial_SRCS variable
aux_source_directory(. DIR_Serial_SRCS)

include_directories(../Config)

# Adds a library target 
add_library(Serial ${DIR_Serial_SRCS})
target_link_libraries(Serial PUBLIC Config pico_stdlib)
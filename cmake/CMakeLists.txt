cmake_minimum_required(VERSION 3.20)

project(jsbsim_wasm LANGUAGES CXX)

if(NOT JSBSIM_SOURCE_DIR)
  message(FATAL_ERROR "JSBSIM_SOURCE_DIR is required")
endif()

if(NOT JSBSIM_WASM_BINDINGS)
  set(JSBSIM_WASM_BINDINGS "${CMAKE_CURRENT_LIST_DIR}/../generated/FGFDMExecBindings.cpp")
endif()

if(NOT EXISTS "${JSBSIM_SOURCE_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "JSBSim source not found at ${JSBSIM_SOURCE_DIR}")
endif()

if(NOT EXISTS "${JSBSIM_WASM_BINDINGS}")
  message(FATAL_ERROR "Generated bindings not found at ${JSBSIM_WASM_BINDINGS}")
endif()

set(BUILD_DOCS OFF CACHE BOOL "" FORCE)
set(BUILD_PYTHON_MODULE OFF CACHE BOOL "" FORCE)
set(BUILD_JULIA_PACKAGE OFF CACHE BOOL "" FORCE)
set(BUILD_MATLAB_SFUNCTION OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(SYSTEM_EXPAT OFF CACHE BOOL "" FORCE)

add_subdirectory("${JSBSIM_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/jsbsim" EXCLUDE_FROM_ALL)

add_executable(jsbsim_wasm "${JSBSIM_WASM_BINDINGS}")

set_target_properties(jsbsim_wasm PROPERTIES
  OUTPUT_NAME "jsbsim_wasm"
  SUFFIX ".mjs"
)

target_compile_features(jsbsim_wasm PRIVATE cxx_std_17)
target_compile_options(jsbsim_wasm PRIVATE -fexceptions)

target_include_directories(jsbsim_wasm PRIVATE
  "${JSBSIM_SOURCE_DIR}/src"
)

target_link_libraries(jsbsim_wasm PRIVATE libJSBSim)

target_link_options(jsbsim_wasm PRIVATE
  --bind
  -O3
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=JSBSimWasmModule
  -sENVIRONMENT=web,worker,node
  -sFILESYSTEM=1
  -sALLOW_MEMORY_GROWTH=1
  -sNO_DISABLE_EXCEPTION_CATCHING
  -sWASM_BIGINT=1
  "-sEXPORTED_RUNTIME_METHODS=['FS']"
)

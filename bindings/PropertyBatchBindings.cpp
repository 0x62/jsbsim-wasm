// Hand-written extension bindings. Unlike generated/FGFDMExecBindings.cpp,
// this file is maintained by hand and is not regenerated.

#include <cstddef>
#include <limits>
#include <memory>
#include <string>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "FGFDMExec.h"
#include "input_output/FGPropertyManager.h"

namespace {

using JSBSim::FGFDMExec;

// Resolves property paths once, then reads or writes all of them through one
// contiguous double buffer. FGFDMExec::GetPropertyValue converts a JS string
// and walks the property tree by path on every call; a batch does that work
// once per path. Nodes are reference counted, so a cached node stays valid
// even if the aircraft is unbound; re-create batches after loading a model.
class PropertyBatch {
 public:
  explicit PropertyBatch(FGFDMExec& exec) : manager_(exec.GetPropertyManager()) {}

  // Returns the slot index. A missing path reads NaN and ignores writes,
  // unless create is true, in which case JSBSim creates the node.
  int add(const std::string& path, bool create) {
    SGPropertyNode* node = manager_ ? manager_->GetNode(path, create) : nullptr;
    nodes_.emplace_back(node);
    values_.push_back(kMissing);
    return static_cast<int>(nodes_.size()) - 1;
  }

  bool has(int index) const { return valid(index) && nodes_[index]; }

  int size() const { return static_cast<int>(nodes_.size()); }

  // Refreshes every slot from the property tree.
  void read() {
    for (std::size_t i = 0; i < nodes_.size(); ++i) {
      values_[i] = nodes_[i] ? nodes_[i]->getDoubleValue() : kMissing;
    }
  }

  // Pushes every slot that has a node into the property tree.
  void write() {
    for (std::size_t i = 0; i < nodes_.size(); ++i) {
      if (nodes_[i]) nodes_[i]->setDoubleValue(values_[i]);
    }
  }

  // A Float64Array view of the slot buffer in wasm memory. It is invalidated
  // by add() and by any wasm memory growth, so callers take a fresh view.
  emscripten::val values() {
    return emscripten::val(emscripten::typed_memory_view(values_.size(), values_.data()));
  }

  double get(int index) const {
    return has(index) ? nodes_[index]->getDoubleValue() : kMissing;
  }

  void set(int index, double value) {
    if (!valid(index)) return;
    values_[index] = value;
    if (nodes_[index]) nodes_[index]->setDoubleValue(value);
  }

 private:
  static constexpr double kMissing = std::numeric_limits<double>::quiet_NaN();

  bool valid(int index) const {
    return index >= 0 && static_cast<std::size_t>(index) < nodes_.size();
  }

  std::shared_ptr<JSBSim::FGPropertyManager> manager_;
  std::vector<SGPropertyNode_ptr> nodes_;
  std::vector<double> values_;
};

}  // namespace

EMSCRIPTEN_BINDINGS(jsbsim_property_batch) {
  emscripten::class_<PropertyBatch>("PropertyBatch")
    .constructor<FGFDMExec&>()
    .function("add", &PropertyBatch::add)
    .function("has", &PropertyBatch::has)
    .function("size", &PropertyBatch::size)
    .function("read", &PropertyBatch::read)
    .function("write", &PropertyBatch::write)
    .function("values", &PropertyBatch::values)
    .function("get", &PropertyBatch::get)
    .function("set", &PropertyBatch::set);
}

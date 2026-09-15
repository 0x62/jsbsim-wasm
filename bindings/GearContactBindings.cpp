// Hand-written extension bindings. Unlike generated/FGFDMExecBindings.cpp,
// this file is maintained by hand and is not regenerated.

#include <cstddef>
#include <memory>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "FGFDMExec.h"
#include "models/FGGroundReactions.h"
#include "models/FGLGear.h"

namespace {

using JSBSim::FGFDMExec;

// Field order of one gear record. Keep in sync with GEAR_CONTACT_FIELDS in
// src/sdk/gear-contacts.ts. Units are JSBSim's: ft, ft/s, lbf, deg.
enum Field : int {
  kWow = 0,
  kCompressionFt,
  kCompressionVelocityFps,
  kStrutForceLbs,
  kBodyXFt,
  kBodyYFt,
  kBodyZFt,
  kWheelRollVelocityFps,
  kWheelSideVelocityFps,
  kSlipAngleDeg,
  kSteerAngleDeg,
  kWheelRollForceLbs,
  kWheelSideForceLbs,
  kBodyForceXLbs,
  kBodyForceYLbs,
  kBodyForceZLbs,
  kIsBogey,
  kGearPos,
  kFieldCount,
};

// Read-only snapshot of every FGLGear after the last Run(): contact state,
// strut load, contact-point velocity in the wheel frame, and the reaction
// forces JSBSim itself applied (after resolving its friction multipliers).
// Uses side-effect-free getters only; it never changes the simulation.
class GearContacts {
 public:
  explicit GearContacts(FGFDMExec& exec) : exec_(&exec) {}

  int fields() const { return kFieldCount; }

  int count() const {
    auto reactions = exec_ ? exec_->GetGroundReactions() : nullptr;
    return reactions ? reactions->GetNumGearUnits() : 0;
  }

  // Fills count() * fields() doubles and returns the number of gear units.
  int read() {
    auto reactions = exec_ ? exec_->GetGroundReactions() : nullptr;
    const int units = reactions ? reactions->GetNumGearUnits() : 0;
    values_.assign(static_cast<std::size_t>(units) * kFieldCount, 0.0);
    for (int unit = 0; unit < units; ++unit) {
      const std::shared_ptr<JSBSim::FGLGear> gear = reactions->GetGearUnit(unit);
      if (!gear) continue;
      double* out = values_.data() + static_cast<std::size_t>(unit) * kFieldCount;
      const JSBSim::FGColumnVector3 location = gear->GetBodyLocation();
      out[kWow] = gear->GetWOW() ? 1.0 : 0.0;
      out[kCompressionFt] = gear->GetCompLen();
      out[kCompressionVelocityFps] = gear->GetCompVel();
      out[kStrutForceLbs] = gear->GetCompForce();
      out[kBodyXFt] = location(1);
      out[kBodyYFt] = location(2);
      out[kBodyZFt] = location(3);
      out[kWheelRollVelocityFps] = gear->GetWheelRollVel();
      out[kWheelSideVelocityFps] = gear->GetWheelSideVel();
      out[kSlipAngleDeg] = gear->GetWheelSlipAngle();
      out[kSteerAngleDeg] = gear->GetSteerAngleDeg();
      // These call UpdateForces(), which only copies the already-resolved
      // friction multipliers into the force vector; the result is idempotent.
      out[kWheelRollForceLbs] = gear->GetWheelRollForce();
      out[kWheelSideForceLbs] = gear->GetWheelSideForce();
      out[kBodyForceXLbs] = gear->GetBodyXForce();
      out[kBodyForceYLbs] = gear->GetBodyYForce();
      out[kBodyForceZLbs] = gear->GetBodyZForce();
      out[kIsBogey] = gear->IsBogey() ? 1.0 : 0.0;
      out[kGearPos] = gear->GetGearUnitPos();
    }
    return units;
  }

  // A Float64Array view of the last read(); invalidated by the next read()
  // and by wasm memory growth.
  emscripten::val values() {
    return emscripten::val(emscripten::typed_memory_view(values_.size(), values_.data()));
  }

  // Called by the SDK before the FGFDMExec is destroyed.
  void detach() { exec_ = nullptr; values_.clear(); }

 private:
  FGFDMExec* exec_;
  std::vector<double> values_;
};

}  // namespace

EMSCRIPTEN_BINDINGS(jsbsim_gear_contacts) {
  emscripten::class_<GearContacts>("GearContacts")
    .constructor<FGFDMExec&>()
    .function("fields", &GearContacts::fields)
    .function("count", &GearContacts::count)
    .function("read", &GearContacts::read)
    .function("values", &GearContacts::values)
    .function("detach", &GearContacts::detach);
}

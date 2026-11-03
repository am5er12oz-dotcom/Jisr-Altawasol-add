const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
   googleId: { type: String },
 password: { type: String },
resetCode: { type: String },
resetExpires: { type: Date },
resetAttempts: { type: Number, default: 0 },

    gender: { type: String, enum: ["male", "female"], required: true },
    // deaf = أصم، hearing = ناطق
    userType: { type: String, enum: ["deaf", "hearing"], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
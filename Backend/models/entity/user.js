const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },

    email: {
        type: String,
        lowercase: true,
        trim: true,
    },

    passwordHash: { type: String, default: null },

    phone: { type: String, required: true, trim: true },

    dob: { type: Date },

    gender: {
        type: String,
        enum: ["male", "female", "other"],
        default: undefined,
    },

    profileImage: { type: String, default: null },

    city: { type: String, default: null, trim: true },
    cityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "City",
        default: null,
        index: true,
    },
    subDistrict: { type: String, default: null, trim: true },
    subDistrictId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubDistrict",
        default: null,
        index: true,
    },

    fcm_id: { type: String, default: null },

    otp: String,
    otpExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    status: {
        type: String,
        enum: ["active", "inactive", "blocked"],
        default: "active"
    },

    walletBalance: {
        type: Number,
        default: 0,
        min: 0,
    },

}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true, sparse: true });

userSchema.pre("save", function stripEmptyEmail(next) {
    if (this.email == null || this.email === "") {
        this.set("email", undefined);
    }
    next();
});

module.exports = mongoose.model("User", userSchema);
const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true,
        },

        phone: {
            type: String,
            trim: true,
            default: null
        },

        profileImage: {
            type: String,
            default: null
        },

        resetPasswordToken: String,
        resetPasswordExpire: Date,

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);

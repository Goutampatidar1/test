const { User } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { hashPassword } = require("../../utils/password");
const { toPublicProfile } = require("../../utils/toPublicProfile");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { assertObjectId } = require("../../utils/assertObjectId");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const {
  resolveSubDistrictFields,
  hasSubDistrictInput,
} = require("../../utils/shippingAddress");
const { normalizePhone } = require("../../utils/phone");

const UPLOAD_FOLDER = "user";
function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search } = req.query;

  const filter = {};
  if (status) {
    filter.status = status;
  }
  const searchOr = searchFilter(search, ["name", "email", "phone"]);
  if (searchOr) {
    Object.assign(filter, searchOr);
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    users: users.map((u) => toPublicProfile(u)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getUserById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const user = await User.findById(req.params.id).select("-passwordHash");
  if (!user) {
    throw new AppError("User not found", 404);
  }
  res.json({ user: toPublicProfile(user) });
});

exports.createUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    dob,
    gender,
    fcm_id,
    profileImage,
    status,
    city,
    subDistrict,
  } = req.body;

  const nameNorm = normalizeRequired(name);
  const emailRaw = normalizeOptional(email);
  const emailNorm = emailRaw ? emailRaw.toLowerCase() : null;
  let phoneNorm;
  try {
    phoneNorm = normalizePhone(phone);
  } catch (err) {
    deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
    throw err;
  }

  if (!nameNorm || !phoneNorm) {
    deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
    throw new AppError("Name and phone are required", 400);
  }

  if (emailNorm) {
    const existing = await User.findOne({ email: emailNorm });
    if (existing) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Email is already in use", 409);
    }
  }
  const existingPhone = await User.findOne({ phone: phoneNorm });
  if (existingPhone) {
    deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
    throw new AppError("Phone number is already in use", 409);
  }


  const fromFile = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const passwordNorm = String(password ?? "").trim();
  const passwordHash = passwordNorm ? await hashPassword(passwordNorm) : undefined;

  let locationFields = {
    city: normalizeOptional(city),
    cityId: null,
    subDistrict: normalizeOptional(subDistrict),
    subDistrictId: null,
  };
  if (hasSubDistrictInput(req.body)) {
    locationFields = await resolveSubDistrictFields(req.body, {
      city: normalizeOptional(city),
      requireSubDistrict: true,
      assertEcom: false,
    });
  }

  let user;
  try {
    user = await User.create({
      name: nameNorm,
      ...(emailNorm ? { email: emailNorm } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      phone: phoneNorm,
      ...(dob !== undefined && dob !== "" ? { dob } : {}),
      ...(gender ? { gender } : {}),
      fcm_id,
      status: status || "active",
      profileImage: fromFile ?? profileImage ?? null,
      city: locationFields.city,
      cityId: locationFields.cityId,
      subDistrict: locationFields.subDistrict,
      subDistrictId: locationFields.subDistrictId,
    });
  } catch (err) {
    deleteUploadFileByPublicUrl(fromFile);
    throw err;
  }

  res.status(201).json({
    message: "User created",
    user: toPublicProfile(
      await User.findById(user._id).select("-passwordHash")
    ),
  });
});

exports.updateUser = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const {
    name,
    email,
    password,
    phone,
    dob,
    gender,
    fcm_id,
    profileImage,
    status,
    city,
    subDistrict,
  } = req.body;

  if (email !== undefined) {
    const emailRaw = normalizeOptional(email);
    const emailNorm = emailRaw ? emailRaw.toLowerCase() : null;
    if (emailNorm) {
      const taken = await User.findOne({
        email: emailNorm,
        _id: { $ne: user._id },
      });
      if (taken) {
        deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
        throw new AppError("Email is already in use", 409);
      }
      user.email = emailNorm;
    } else {
      user.email = undefined;
    }
  }
  if (phone !== undefined) {
    let phoneNorm;
    try {
      phoneNorm = normalizePhone(phone);
    } catch (err) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw err;
    }
    const existingPhone = await User.findOne({
      phone: phoneNorm,
      _id: { $ne: user._id },
    });
    if (existingPhone) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Phone number is already in use", 409);
    }
    user.phone = phoneNorm;
  }

  const uploadedProfileImage = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  if (uploadedProfileImage) {
    deleteUploadFileByPublicUrl(user.profileImage);
    user.profileImage = uploadedProfileImage;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
    if (profileImage === "" || profileImage === null) {
      deleteUploadFileByPublicUrl(user.profileImage);
      user.profileImage = null;
    } else if (profileImage !== user.profileImage) {
      deleteUploadFileByPublicUrl(user.profileImage);
      user.profileImage = profileImage;
    }
  }

  if (name !== undefined) {
    user.name = normalizeRequired(name);
  }
  if (dob !== undefined) {
    user.dob = dob === "" ? null : dob;
  }
  if (gender !== undefined) {
    user.gender = gender;
  }
  if (fcm_id !== undefined) {
    user.fcm_id = fcm_id;
  }
  if (status !== undefined) {
    user.status = status;
  }
  if (
    hasSubDistrictInput(req.body) ||
    city !== undefined ||
    subDistrict !== undefined ||
    Object.prototype.hasOwnProperty.call(req.body, "subDistrictId") ||
    Object.prototype.hasOwnProperty.call(req.body, "cityId")
  ) {
    const locationFields = await resolveSubDistrictFields(
      {
        ...req.body,
        city: req.body.city ?? user.city,
        subDistrict: req.body.subDistrict ?? user.subDistrict,
        subDistrictId: req.body.subDistrictId ?? user.subDistrictId,
      },
      {
        city: req.body.city ?? user.city,
        requireSubDistrict: Boolean(
          hasSubDistrictInput(req.body) || user.subDistrict || user.subDistrictId
        ),
        assertEcom: false,
      }
    );
    user.city = locationFields.city;
    user.cityId = locationFields.cityId;
    user.subDistrict = locationFields.subDistrict;
    user.subDistrictId = locationFields.subDistrictId;
  }
  if (password) {
    user.passwordHash = await hashPassword(password);
  }

  await user.save();
  res.json({
    message: "User updated",
    user: toPublicProfile(await User.findById(user._id).select("-passwordHash")),
  });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError("User not found", 404);
  }
  deleteUploadFileByPublicUrl(user.profileImage);
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
});

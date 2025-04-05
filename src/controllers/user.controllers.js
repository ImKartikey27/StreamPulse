import { asyncHandler } from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const registerUser = asyncHandler( async (req,res) => {
    console.log("API called register user")
    const {fullname , email , username , password} = req.body
    
    //validation
    if(
        [fullname, email, username, password].some((field) => field?.trim() === "")
    ){
        console.log("error should be here");
        throw new ApiError(400, "All Fields are required")
    }
    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser){
        throw new ApiError(409, "User Already Exists")
    }
    const avatarLocalPath = req.files?.avatar?.[0]?.path
    const coverLocalPath = req.files?.coverImage?.[0]?.path

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is missing")
    }
    // if(!coverLocalPath){
    //     throw new ApiError(400, "Cover Image is missing")
    // }

    // const avatar = await uploadOnCloudinary(avatarLocalPath)
    // let coverImage = ""
    // if(coverLocalPath){
    //     coverImage = await uploadOnCloudinary(coverLocalPath)
    // }

    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath)
        console.log("Uploaded Avatar", avatar);
    } catch (error) {
        console.log("Error Uploading avatar", error);
        throw new ApiError(500, "Failed to upload avatar")
        
    }

    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverLocalPath)
        console.log("Uploaded coverImage", coverImage);
    } catch (error) {
        console.log("Error Uploading coverImage", error);
        throw new ApiError(500, "Failed to upload coverImage")
        
    }

    try {
        const user = await User.create({
            fullname,
            avatar: avatar.url,
            coverimage: coverImage?.url || "",
            email,
            password,
            username: username.toLowerCase()
        })
    
        const createrUser = await User.findById(user._id).select(
            "-password -refreshToken"
        )
        if(!createrUser){
            throw new ApiError(500 , "Something Went Wrong while registering the user")
        }
        return res
            .status(201)
            .json(new ApiResponse(200 , createrUser, "User Registered"))
    } catch (error) {
        console.log("User Creation failed");

        if(avatar){
            await deleteFromCloudinary(avatar.public_id)
        }
        if(coverImage){
            await deleteFromCloudinary(coverImage.public_id)
        }
        throw new ApiError(500, "Something went wrong while registering a user and images were deleted")
    }
})

export {
    registerUser
}
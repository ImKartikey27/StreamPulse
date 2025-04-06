import { asyncHandler } from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { jwt } from "jsonwebtoken"

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        if(!user){
            throw new ApiError(404, "User does not exist")
        }
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
    
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generation access and refresh tokens")
    }
}


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

const loginUser = asyncHandler(async (req,res) => {
    //get data from the body 
    const {email , username , password} = req.body

    //validation
    if(!email){
        throw new ApiError(400, "Email is required")
    }
    if(!username){
        throw new ApiError(400, "Email is required")
    }
    if(!password){
        throw new ApiError(400, "password is required")
    }

    const user = await User.findOne({
        $or: [{username},{email}]
    })
    if(!user){
        throw new ApiError(404, "User not found")
    }

    //validate the password
    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid Credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id)
        .select("-password -refreshToken")

    if(!loggedInUser){
        throw new ApiError(404 , "User Not Found")
    }
    const option = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .json( new ApiResponse(
            200,
            {user: loggedInUser, accessToken, refreshToken},
            "User Logged In Successfully"
        ))
})

const logoutUser = asyncHandler(async(req,res)=> {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined,
            }
        },
        {new: true}
    )
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    }
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, "User logged out successfully"))
})

const refreshAccessToken = asyncHandler(async(req,res)=> {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "Refresh Token is required")
    }
    try {
        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Invalid refresh token")
        }
        const options = {
            httpOnly:true,
            secure: process.env.NODE_ENV === "production"
        }
        const {accessToken, refreshToken: newRefreshToken} = await generateAccessAndRefreshToken(user._id)

        return res
            .status(200)
            .cookies("accessToken", accessToken, options)
            .cookies("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {accessToken, refreshToken: newRefreshToken},
                    "Access Token refreshed successfully"
                )
            )
    } catch (error) {
        throw new ApiError(500, "Something went wrong while refreshing access token")
        
    }
})

const changeCurrentPassword = asyncHandler(async(req,res)=> {
    const {oldPassword, newPassword} = req.body
    const user = await User.findById(req.user?._id)
    const isPasswordValid = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordValid){
        throw new ApiError(401, "Old Password is incorrect")
    }
    user.password = newPassword

    await user.save({validateBeforeSave:false})

    return res.status(200).json(new ApiResponse(200, {}, "Password Changed Successfully"))
})

const getCurrentUser = asyncHandler(async(req,res)=> {
    
})

const updateAccountDetails = asyncHandler(async(req,res)=> {

})

const updateUserAvatar = asyncHandler(async(req,res)=> {

})

const updateUserCoverImage = asyncHandler(async(req,res)=> {

})

export {
    registerUser,
    refreshAccessToken,
    loginUser,
    logoutUser,
}
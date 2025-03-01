import { authOptions } from "../../auth/[...nextauth]";
import { getServerSession } from "next-auth/next";

import connectMongo from "@config/mongo";
import logger from "@config/logger";
import Profile from "@models/Profile";
import {
  associateProfileWithAccount,
  getAccountByProviderAccountId,
} from "../account";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).json({ message: "You must be logged in." });
    return;
  }

  const username = session.username;
  if (!["GET", "PUT"].includes(req.method)) {
    return res
      .status(400)
      .json({ error: "Invalid request: GET or PUT required" });
  }

  let profile = {};
  if (req.method === "GET") {
    profile = await getProfileApi(username);
  }
  if (req.method === "PUT") {
    profile = await updateProfileApi(username, req.body, session.user.id);
  }

  if (profile.error) {
    return res.status(400).json({ message: profile.error });
  }
  return res.status(200).json(profile);
}

export async function getProfileApi(username) {
  await connectMongo();
  const log = logger.child({ username });

  let getProfile = await Profile.findOne({ username });

  if (!getProfile) {
    log.info(`peofile not found for username: ${username}`);
    return { error: "Profile not found." };
  }

  return JSON.parse(JSON.stringify(getProfile));
}

export async function updateProfileApi(username, data, providerAccountId) {
  await connectMongo();
  const log = logger.child({ username });

  let getProfile = {};

  const updateProfile = {
    source: "database",
    layout: data.layout,
    name: data.name,
    isStatsPublic: data.isStatsPublic,
    bio: data.bio,
    tags: data.tags
      .filter((tag) => Boolean(tag.trim()))
      .map((tag) => tag.trim()),
  };

  try {
    await Profile.validate(updateProfile, [
      "source",
      "layout",
      "name",
      "bio",
      "isStatsPublic",
    ]);
  } catch (e) {
    return { error: e.errors };
  }

  let account = {};
  try {
    account = await getAccountByProviderAccountId(providerAccountId);
    if (account) {
      updateProfile.account = account._id;
    }
  } catch (e) {
    log.error(e, `failed to get account for username: ${username}`);
  }
  try {
    getProfile = await Profile.findOneAndUpdate({ username }, updateProfile, {
      upsert: true,
      new: true,
    });
    log.info(`profile created for username: ${username}`);
  } catch (e) {
    log.error(e, `failed to create profile stats for username: ${username}`);
  }

  // associate profile to account
  try {
    await associateProfileWithAccount(account, getProfile._id);
  } catch (e) {
    log.error(
      e,
      `failed to associate profile to account for username: ${username}`
    );
  }

  return JSON.parse(JSON.stringify(getProfile));
}

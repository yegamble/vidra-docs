---
title: Using your account after a PeerTube migration
description: Sign in to your migrated account, recover access, and find videos and saved links in Vidra v0.7.31.
---

# Using your account after a PeerTube migration

Once your site reopens on Vidra, use its usual address. Your site's operator can confirm when sign-in and uploads are available.

## Sign in to your account

Choose **Sign in**, enter your PeerTube email or username, and use the password you last set on the source site. This works for active imported accounts that had a local password. A password you changed only on a rehearsal site can be replaced by the final import.

- **Forgot your password?** Choose **Forgot your password?** on the sign-in page and enter the email address on your account. If the account is active and the site can send mail, open the single-use link and set a new password. A successful reset signs you out of existing sessions. The confirmation on the request page looks the same for every address.
- **Used two-factor authentication on PeerTube?** The importer holds an account that had an authenticator enrolled. Contact your site's operator to recover access, then enroll your authenticator again in Vidra's **Security** settings and save the new recovery codes. Resetting your password alone leaves the hold in place.
- **Used external sign-in, lost access to the mailbox, or received no email?** Contact your site's operator. An account that used only a PeerTube sign-in provider has no local password to carry across. Open **About** and choose **Contact us** if your site offers the form, or use the contact address your operator publishes. Include your username and the symptom. Keep passwords, reset links, authenticator codes and recovery codes private.

## Find a video or channel

For an imported public video, try your original watch link, including `/w/…` and `/videos/watch/…`. A saved start time such as `?start=1m30s` carries across. Vidra also recognizes PeerTube video and playlist embed links. Old local channel links such as `/c/HANDLE/videos` and `/video-channels/HANDLE` open the channel. A private account profile can still be unavailable to other viewers.

The watch page and newest-first lists use the video's publication time on the source site when available. They fall back to its creation time when the publication time is missing. A video uploaded in August and published in November appears with the November videos. A separate original publication date can record when it first appeared elsewhere.

| If you are looking for… | Where to look |
|---|---|
| An unlisted video | Use its watch link. Public listings and search omit it. |
| A video restricted to site members | Sign in to the site before opening it. |
| Your private video or draft | Sign in as its owner and open Studio. Anonymous viewers cannot play it. PeerTube videos that required a shared password import as private. |
| A video that still appears missing | Send the old watch URL and channel name to the operator through the site's contact route. The operator can check the import and moderation status. |

## Play a video on your phone

On sites running the v0.7.34 web player or later, tap the video to show the
controls. Tap the speaker to silence the video. Its screen reader label changes
from **Mute** to **Unmute**. Tap it again to restore the sound. Open **Settings**
(the cog). When the video offers quality options, choose **Playback quality**
to see them.

Below the video, tap the channel name to open the channel. Its follower count
appears beneath the name once it loads. **Follow** uses your account on this
site. If you're signed out and see **Interact from your instance**, you can
use an account on another server to interact with the video.

## Recover missing data

For missing uploads or account data after a site restore, contact the operator and include the affected URL and approximate date. Site-wide restores use the operator's database, configuration and media backups. For example, a database dump can identify a video even when its media file still needs to be recovered separately.

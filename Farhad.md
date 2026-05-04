This is a test deployement. 


# PROMPT:
                                                                                                                                                                                      
  origin/main vs origin/dev:                                                                                                                                                          
    Dev has 1 commit main doesn't:
      014d9e3 fix(auth): legible auth errors + skip TOKEN_REFRESHED rebuild   ← today                                                                                                 
    Main has 15 commits dev doesn't.                              

  So everything dev has IS on main, except today's auth-error fix.

  ---
  However — flagging something to look at when you have a minute. Several of the 15 commits main has look like the temp/mentor commits that we explicitly stripped from dev when we
  built the clean-ship branch:

  47ebc61  Added Mentor endpoints
  86a7606  feat(temp): A/B image-gen provider switch in AI CEO chat
  6a40061  feat(temp/img-debug): browser logs + hallucination detector + Content toggle
  adf91e8  fix: LI carousel + Marketing chat save reliability
  8814745  docs(deploy): always run `railway up` from REPO ROOT, not backend/
  9b78d58  fix(ai-ceo): show "Open preview" card on image-gen messages
  6f23261  fix(generate/image): fail loud when upstream returns 200 but no image
  3a0581e  fix(orchestrate): forbid hallucinating image generation
  6a40061  feat(temp/img-debug)…
  c7778a9  fix(aiceo): one-at-a-time image viewer in preview panel

  These are the original SHAs, which means main isn't running the cleaned-up cherry-picks from release/clean-from-dev — it's running the raw mentor/temp work directly. Some of those
  (the feat(temp/…) ones, the mentor endpoint, the A/B provider switch) are exactly the code we agreed shouldn't ship to production. Most likely a merge picked up those commits via
  mentor/experiment or via an old dev tip.

  Two questions before any next step:
  1. Want me to verify whether backend/routes/generate.js on origin/main right now still references MENTOR_BASE_URL / MENTOR_API_KEY? That'd confirm if mentor is actually live in
  production code or just looks that way in the log.
  2. Want me to merge today's 014d9e3 into main (just the auth fix) — separate concern from the cleanup?
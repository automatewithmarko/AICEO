

# Meeting Participants & Events

Most recordings typically have associated meeting participants and participant events. Recall.ai's API exposes these through a variety of endpoints outlined below.

# Participants

***

Recall.ai records and exposes participants for recordings automatically, so no configuration is needed.

## Retrieving Participants

The response schema can be found at [Participants Download Schema](https://docs.recall.ai/docs/download-urls#json-participant-download-url).

### Retrieve participants for a bot

After calling the [Retrieve Bot](https://docs.recall.ai/reference/bot_retrieve) endpoint, the `recordings` in the response will contain a `media_shortcuts` object.

In this object, you can download the participants by accessing the `participant_events.data.participants_download_url`:

```
{
  "recordings": [
    {
      "id": "a5437136-4b69-429a-9e0c-cd388fd8fee6",
      ...
      "participant_events": {
        "id": "a7ae9238-0e2d-40f2-8480-8e9c0cf3af6c",
        "data": {
          "participants_download_url": "https://us-east-1.recall.ai/api/v1/download/participants?token=eyJpZCI6ImE3YWU5MjM4LTBlMmQtNDBmMi04NDgwLThlOWMwY2YzYWY2YyJ9%3A1tOqjv%3AapjfmYtSltJrroNgtl0RORSrwP-Q03ErOq7VymGbwuY",
          ...
        }
      },
    }
  ],
  ...
]
```

### Re-joining behaviors

In meetings, participants can sometimes leave and re-join the same meeting while the bot is in the call. This will produce different outputs in the list of participants, where a participant could either emit a `participant.leave` followed by a `participant.join` event or produce a new (duplicate) participant object altogether. The result you see in the list of participants depends on several factors which are listed out below:

<Table align={["left","left","left"]}>
  <thead>
    <tr>
      <th>
        Meeting platform
      </th>

      <th>
        Signed-in Participant
      </th>

      <th>
        Anonymous Participant
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        Zoom
      </td>

      <td>
        * Web client
          * On page-reloads, adds participant join event for existing participant
          * On closing tab and joining link from new tab, adds a new (duplicate) participant
        * Zoom App
          * On re-joining, adds a new (duplicate) participant
      </td>

      <td>
        * On network disconnects (e.g. page-reloads), adds participant join event for existing participant
        * On new sessions (e.g. closing tab and joining link from new tab), adds a new (duplicate) participant
      </td>
    </tr>

    <tr>
      <td>
        Google
      </td>

      <td>
        Create a new (duplicate) participant
      </td>

      <td>
        Create a new (duplicate) participant
      </td>
    </tr>

    <tr>
      <td>
        Microsoft Teams
      </td>

      <td>
        Add a participant join event for the existing participant
      </td>

      <td>
        Create a new (duplicate) participant
      </td>
    </tr>

    <tr>
      <td>
        Webex
      </td>

      <td>
        Add a participant join event for the existing participant
      </td>

      <td>
        Create a new (duplicate) participant
      </td>
    </tr>
  </tbody>
</Table>

### Retrieve participants for a recording

To retrieve a given recording's list of participants, you can call the [List Participant Events](https://docs.recall.ai/reference/participant_events_list) endpoint, using the bot's corresponding recording ID:

```curl
curl --request GET \
     --url https://us-west-2.recall.ai/api/v1/participant_events?recording_id=RECORDING_ID \
     --header "Authorization: $RECALLAI_API_KEY" \
     --header "accept: application/json"
```

*Example Response:*

```json
{
  "next": "...", // URL pre-filled with params/cursor value to fetch the next page
  "previous": "...",
  "results": [
    {
      id: "...",
      // ...
      data: {
	      participant_events_download_url: '...',
				speaker_timeline_download_url: '...',
				participants_download_url: '...'
      }
    }
  ]
}
```

Then you can query the `participants_download_url` and you will receive the data in JSON format as seen in [this schema](https://docs.recall.ai/docs/download-schemas#json-participant-download-url)

### How to get participant emails

Participant emails are available when scheduling bots via the Calendar V1 or V2 integrations. This feature is currently behind a feature flag - contact [support@recall.ai](mailto:support@recall.ai) to request access. See [Meeting Participant Emails](https://docs.recall.ai/docs/meeting-participant-emails) for more information.

# Participant Events

***

Recall.ai exposes participant events as an artifact of a recording.

## Configuration

To configure a bot to record participant events, no configuration is needed, since the default is to generate this artifact.

You can also explicitly set this by providing an `participant_events` object in your [Create Bot](https://docs.recall.ai/reference/bot_create) request's `recording_config`:

```curl
curl --request POST \
     --url https://us-west-2.recall.ai/api/v1/bot/ \
		 --header "authorization: $RECALLAI_API_KEY"
     --header "accept: application/json" \
     --header "content-type: application/json" \
     --data '
{
  "meeting_url": "https://meet.google.com/ggt-kpdk-mrj",
  "recording_config": {
    "participant_events": {}
  }
}
'
```

## Retrieving Events

To retrieve a bot's participant events, you can call the [Retrieve Bot](https://docs.recall.ai/reference/bot_retrieve) and access the `media_shorcuts.participant_events.data.participant_events_download_url` in the recording object.

The response schema can be found [Download URL Schemas: Participant Events](https://docs.recall.ai/docs/download-urls#json-participant-event-download-url).

To retrieve all participant events for a specific **recording**, use the [List Participant Events](https://docs.recall.ai/reference/participant_events_list) endpoint while specifying a `recording_id`:

```curl
curl --request GET \
     --url 'https://us-west-2.recall.ai/api/v1/participant_events/?recording_id={RECORDING_ID}' \
     --header "Authorization: $RECALLAI_API_KEY" \
     --header "accept: application/json"
```

*Example response*

```json
{
  "next": "...",
  "previous": "...",
  "results": [
    {
      "id": "9aa74189-92d0-410a-b247-4239e42c2465",
      "recording_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "created_at": "2024-12-01T21:29:51.019Z",
      "status": {
        "code": "string",
        "sub_code": "string",
        "updated_at": "2024-12-01T21:29:51.019Z"
      },
      "metadata": {},
      "data": {
        "participant_events_download_url": "https://...",
        "speaker_timeline_download_url": "https://...",
        "participants_download_url": "https://..."
      }
    }
  ]
}
```

The `data.download_url` will be populated with a pre-signed URL where you can download the entire artifact's contents.

<br />

## FAQ's

***

### How do I know the state of a user's camera if the bot joins after the participant?

In addition to tracking changes to participant webcam states during the call, you can use the following to know what their webcam was for the duration of the call:

* If a participant's webcam was on for the entire call, the bot will still emit a `webcam_on` event. If the participant was present prior to the bot joining the call, the bot will still capture a `webcam_on` event.
* If the participant's webcam was off the entire duration of the call, **no** `webcam_off` or `webcam_on` events will be present for that participant.

This behavior is the same regardless of whether the participant is already present before the bot joins, or the participant joins after the bot.

<br />
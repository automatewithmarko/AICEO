

# How to get Separate Audio per Participant (Async)

Produce separate audio files for each participant after the recording is complete.

This guide is for you if:

* You want to get separate recording files for each participant
* You want to diarize/analyze each participant in the call individually

### Platforms Support

| Platform             |    |
| :------------------- | :- |
| Zoom                 | ✅  |
| Microsoft Teams      | ✅  |
| Google Meet          | ✅  |
| Webex                | ❌  |
| Slack Huddles (Beta) | ❌  |
| Go-To Meeting (Beta) | ❌  |

<Callout icon="🚧" theme="warn">
  This is a compute heavy feature and **we recommend using  <Anchor label="4 core bots" target="_blank" href="doc:stream-media#addressing-audio-and-video-issues-bot-variants">4 core bots</Anchor>** to ensure the bot has enough resources to process the separate streams. This comes with an associated cost increase, you can read more about this on our [usage page](https://docs.recall.ai/docs/calculating-usage).
</Callout>

## Implementation

### Step 1: Create a bot

To get separate audio per participant, you must set `recording_config.audio_separate_raw = {}`. Below is an example of what it would look like in your request

```curl
curl --request POST \
     --url https://us-west-2.recall.ai/api/v1/bot \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --header 'authorization: YOUR_RECALL_API_KEY' \
     --data '
{
  "meeting_url": "YOUR_MEETING_URL",
  "recording_config": {
    "audio_separate_raw": {} # Add this to your request body
  }
}
'

```

```typescript
const response = await fetch("https://us-west-2.recall.ai/api/v1/bot", {
  method: "POST",
  headers: {
    "accept": "application/json",
    "content-type": "application/json"
    "authorization": "YOUR_RECALL_API_KEY" // Update this
  },
  body: JSON.stringify({
    meeting_url: "YOUR_MEETING_URL", // Update this
    recording_config: {
      video_separate_mp4: {} # Add this to your request body
    }
  })
});

if (!response.ok) {
  throw new Error(`Error: ${response.status} ${response.statusText}`);
}

const data = await response.json();

```

```python
import requests

response = requests.post(
    "https://us-west-2.recall.ai/api/v1/bot",
    json={
      "meeting_url": "YOUR_MEETING_URL", # Update this
      "recording_config": {
		    "video_separate_mp4": {} # Add this to your request body
      }
    },
    headers={
      "accept": "application/json",
      "content-type": "application/json",
    	"authorization": "YOUR_RECALL_API_KEY" # Update this
    }
)

if not response.ok:
 	errorMessage = f"Error: {response.status_code} - {response.text}"
  raise requests.RequestException(errorMessage)
  
result = response.json()

```

### Step 2: Get the recordings for the call

To access these separate participant audio

First retrieve the existing bot

```curl
curl --request GET \
     --url https://us-west-2.recall.ai/api/v1/bot/YOUR_RECALL_BOT_ID/ \
     --header 'Authorization: YOUR_RECALL_API_KEY' \
     --header 'accept: application/json'
     
```

```typescript
const recall_bot_id = 'YOUR_RECALL_BOT_ID' // Update this
const recall_api_key = 'YOUR_RECALL_API_KEY' // Update this

const get_recall_bot = async (args: { recall_bot_id: string, recall_api_key: string }) => {
    const { recall_bot_id } = args
    const bot_response = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${recall_bot_id}`, {
        method: "GET",
        headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": recall_api_key
        }
    });

    if (!bot_response.ok) {
        throw new Error(`Error: ${bot_response.status} ${bot_response.statusText}`);
    }

    return await bot_response.json();
}

const recall_bot = await get_recall_bot({ recall_bot_id, recall_api_key });

```

```python
import requests

recall_bot_id = 'YOUR_RECALL_BOT_ID'  # Update this
recall_api_key = 'YOUR_RECALL_API_KEY'  # Update this

def get_recall_bot(args: dict):
    recall_bot_id = args.get("recall_bot_id")
    recall_api_key = args.get("recall_api_key")
    
    url = f"https://us-west-2.recall.ai/api/v1/bot/{recall_bot_id}"
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": recall_api_key
    }
    
    response = requests.get(url, headers=headers)
    
    if not response.ok:
        raise Exception(f"Error: {response.status_code} {response.reason}")
    
    return response.json()

recall_bot = get_recall_bot({"recall_bot_id": recall_bot_id, "recall_api_key": recall_api_key})

```

The bot will have an array of recordings in the `bot.recording` field as defined in the [Retrieve Bot](https://docs.recall.ai/reference/bot_retrieve) 200 response

Once taken, query the recordings api for the recording id on the bot. This will return a list of medias associated to the recording:

```curl
curl --request GET \
     --url 'https://us-west-2.recall.ai/api/v1/audio_separate?recording_id=RECALL_RECORDING_ID' \
     --header 'Authorization: YOUR_RECALL_API_KEY' \
     --header 'accept: application/json'
     
```

```typescript
const recall_recording_id = bot.recordings[0].id;

const get_recall_separate_video_data = async (args: { recall_recording_id: string, recall_api_key: string }) => {
    const { recall_recording_id, recall_api_key } = args
    const separate_video_response = await fetch(
        `https://us-west-2.recall.ai/api/v1/audio_separate?recording_id=${recall_recording_id}`,
        {
            method: "GET",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": recall_api_key
            }
        }
    );

    if (!separate_video_response.ok) {
        throw new Error(`Error: ${separate_video_response.status} ${separate_video_response.statusText}`);
    }

    return await separate_video_response.json()
}

const separate_video_data = await get_recall_separate_video_data({ 
  recall_recording_id: recall_bot.recordings[0].id, 
  recall_api_key 
})

```

```python
recall_recording_id = recall_bot["recordings"][0]["id"]

def get_recall_separate_video_data(args: dict):
    recall_recording_id = args.get("recall_recording_id")
    recall_api_key = args.get("recall_api_key")
    
    url = f"https://us-west-2.recall.ai/api/v1/audio_separate?recording_id={recall_recording_id}"
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": recall_api_key
    }
    
    response = requests.get(url, headers=headers)
    
    if not response.ok:
        raise Exception(f"Error: {response.status_code} {response.reason}")
    
    return response.json()

separate_audio_data = get_recall_separate_audio_data({
    "recall_recording_id": recall_recording_id,
    "recall_api_key": recall_api_key
})

```

The `separate_audio_response` schema is defined in the [List Audio Separate](https://docs.recall.ai/reference/audio_separate_list) 200 response

### Step 3: Accessing separate participant audio

Now that you have the recordings list, you can filter for the separate participant audios and query the data:

```typescript
const get_recall_separate_audio_parts = async (args: { separate_audio_data: any }) => {
    const { separate_audio_data } = args;
    const audios = separate_audio_data.results;

    const audio_parts = Promise.all(
        audios.map(async (audio) => {
            const response = await fetch(audio.data.download_url);

            if (!response.ok) {
                throw new Error(`Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        })
    );
    return audio_parts;
}

const separate_audio_parts = await get_recall_separate_audio_parts({ separate_audio_data })

```

```python
unmixed_videos = [media for media in separate_video_response.results if media["type"] == "mp4_video_mixed"]

import requests

def get_recall_separate_video_parts(args: dict):
    separate_video_data = args.get("separate_video_data")
    videos = separate_video_data["results"]

    video_parts = []
    for video in videos:
        download_url = video["data"]["download_url"]
        response = requests.get(download_url)
        
        if response.status_code != 200:
            raise Exception(f"Error: {response.status_code} {response.reason}")
        
        video_parts.append(response.json())
    
    return video_parts

separate_video_parts = get_recall_separate_video_parts({"separate_video_data": separate_video_data})

```

The `separate_audio_parts` will look like the schema defined in [Participant Separate Audio Parts JSON](https://beta-docs.recall.ai/docs/download-urls#json-participant-separate-audio-parts)

#### Downloading media binary

You can also download the audio media binary like so:

```typescript
import fs from 'fs';

async function download_and_process_file(args: { download_url: string, file_path: string }) {
    try {
        const { download_url, file_path } = args;
        const response = await fetch(download_url);

        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }

        const fileStream = fs.createWriteStream(file_path);

        // For binary data, we need to use response.arrayBuffer() and write the buffer
        const buffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        fileStream.write(uint8Array);
        fileStream.end();

        return new Promise((resolve, reject) => {
            fileStream.on('finish', () => {
                console.log(`File saved to ${file_path}`);
                resolve(file_path);
            });
            
            fileStream.on('error', (error) => {
                console.error(`Error saving file: ${error}`);
                reject(error);
            });
        });
    } catch (error) {
        console.error(`Error downloading the file: ${error}`);
        throw error;
    }
}

const unmixed_audio_part = separate_audio_parts[0]
	?.find((audio_part: any) => audio_part.participant.is_host = true);
const unmixed_audio_part_download_url = unmixed_audio_part.download_url
download_and_process_file({ 
  download_url: unmixed_audio_part_download_url, 
  file_path: './unmixed_audio.mp4' 
});

```

```python
import requests

def download_and_process_file(args: dict):
    try:
        download_url = args.get("download_url")
        file_path = args.get("file_path")

        # Send the request to download the file
        response = requests.get(download_url, stream=True)
        if response.status_code != 200:
            raise Exception(f"Failed to download file: {response.status_code} {response.reason}")

        # Save the file
        with open(file_path, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:  # filter out keep-alive chunks
                    file.write(chunk)

        print(f"File saved to {file_path}")
        return file_path
    except Exception as error:
        print(f"Error downloading the file: {error}")
        raise

# Example usage
unmixed_audio_part = next(
    (audio_part for audio_part in separate_audio_parts[0] if audio_part["participant"]["is_host"] == True),
    None
)

if unmixed_audio_part:
    unmixed_audio_part_download_url = unmixed_audio_part["download_url"]
    file_path = "./unmixed_audio.mp4"
    download_and_process_file({"download_url": unmixed_audio_part_download_url, "file_path": file_path})

```

## Full Script

```typescript
import fs from 'fs';

const recall_api_key = 'YOUR_RECALL_API_KEY'
const recall_bot_id = 'YOUR_RECALL_BOT_ID'

interface SeparateAudioResponse {
    next: null;
    previous: null;
    results: Array<{
        id: string;
        recording: {
            id: string;
            metadata: Record<string, any>;
        };
        created_at: string;
        status: {
            code: 'done';
            sub_code: null;
            updated_at: string;
        };
        metadata: Record<string, any>;
        data: {
            download_url: string;
        };
        format: string;
    }>;
}

export const start = async () => {
    const recall_bot = await get_recall_bot({ recall_bot_id, recall_api_key });
    const separate_audio_data = await get_recall_separate_audio_data({ recall_recording_id: recall_bot.recordings[0].id, recall_api_key })
    const separate_audio_parts = await get_recall_separate_audio_parts({ separate_audio_data })    
    
    console.log(JSON.stringify(separate_audio_parts, null, 2))

    // Download the unmixed audio
    const is_host = false;
    const unmixed_audio_part = separate_audio_parts[0]
        ?.find((audio_part: any) => audio_part.participant.is_host === is_host);
    const unmixed_audio_part_download_url = unmixed_audio_part.download_url
    download_and_process_file({ download_url: unmixed_audio_part_download_url, file_path: `./unmixed_audio-${unmixed_audio_part.participant.is_host ? 'host' : 'guest'}.mp3` });

    console.log(JSON.stringify(separate_audio_parts, null, 2))
};

const get_recall_bot = async (args: { recall_bot_id: string, recall_api_key: string }) => {
    const { recall_bot_id } = args
    const bot_response = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${recall_bot_id}`, {
        method: "GET",
        headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": recall_api_key
        }
    });

    if (!bot_response.ok) {
        throw new Error(`Error: ${bot_response.status} ${bot_response.statusText}`);
    }

    return await bot_response.json();
}


const get_recall_separate_audio_data = async (args: { recall_recording_id: string, recall_api_key: string }) => {
    const { recall_recording_id, recall_api_key } = args
    const separate_audio_response = await fetch(
        `https://us-west-2.recall.ai/api/v1/audio_separate?recording_id=${recall_recording_id}`,
        {
            method: "GET",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": recall_api_key
            }
        }
    );

    if (!separate_audio_response.ok) {
        throw new Error(`Error: ${separate_audio_response.status} ${separate_audio_response.statusText}`);
    }

    return await separate_audio_response.json()
}

const get_recall_separate_audio_parts = async (args: { separate_audio_data: SeparateAudioResponse }) => {
    const { separate_audio_data } = args;
    const audios = separate_audio_data.results;

    const audio_parts = Promise.all(
        audios.map(async (audio) => {
            const response = await fetch(audio.data.download_url);

            if (!response.ok) {
                throw new Error(`Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        })
    );
    return await audio_parts;
}

async function download_and_process_file(args: { download_url: string, file_path: string }) {
    try {
        const { download_url, file_path } = args;
        const response = await fetch(download_url);

        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }

        const fileStream = fs.createWriteStream(file_path);

        // For binary data, we need to use response.arrayBuffer() and write the buffer
        const buffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        fileStream.write(uint8Array);
        fileStream.end();

        return new Promise((resolve, reject) => {
            fileStream.on('finish', () => {
                console.log(`File saved to ${file_path}`);
                resolve(file_path);
            });
            
            fileStream.on('error', (error) => {
                console.error(`Error saving file: ${error}`);
                reject(error);
            });
        });
    } catch (error) {
        console.error(`Error downloading the file: ${error}`);
        throw error;
    }
}

start();
 
```

<br />

## FAQ

### What's the maximum number of audio streams sent at any one time?

The maximum number of audio streams we send is 16 at a time. We send the audio streams of the 16 most recent people who have spoken.

### When is the websocket connection established/closed?

The connection is established immediately when participant unmutes, and is immediately torn down when participant mutes.

### Why does one participant have more than one URL available to download?

If a participant goes on mute, and then unmutes, their audio after the mute will be included in a separate download URL. So it's possible for a single participant to have multiple download URL's in a single meeting.
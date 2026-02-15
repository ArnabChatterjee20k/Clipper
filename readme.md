# About
A MVP of an editor for locally editing medias via http request
No auth
# Tech
db -> postgres  
queue -> postgres only since everything would be step actions
server -> python fastapi
tools -> ffmpeg and PIL
storage -> minio3
Observability & Telemetry -> grafana and promtetheus

# Features
## Media
resource -> bucket
### Upload
* POST /bucket/upload
* Will take a media(image/video) and upload it to a primary bucket
#### TODO: 
* use a presigned url later on with cleanup for orphan files
* use sha-256 for identifying duplicate files
### List
* GET /bucket/upload 
### Filter
* GET /bucket/upload?type=<image|video>&uploadedAt=<>

## Edit
resource -> edit
* Client will select the video/image from the bucket.
* using a single endpoint to edit only and options via query params

### Valid Editing options
* Image -> crop, resise, opacity, color, format

* Video -> trim, format

### Metrics
* Actions -> queued, processing, completed, failed, error, processing time (can't be done per operation as it can have a single comnplex operation)
* Worker -> Enqueue, dequeue, process -> time

Actions status itself can say whats the performance of our worker pool -> how many in different status

### Workflow
* Worker side
worker gonna poll postgres
filter
status = processing 
order by created_at
add the action and mark status as processing then completed
correctly impose the trial

* User side
user uploaded video
upload the video first to a bucket
start a session with the file
user start editing
add pg entry with status queued and action

Using simple polling 
For notfication on completion to the suer using listen/notify

# TODO
* ui -> status monitoring in the edits window
delete workflows, workflow executions tab in the workflow

* image apis -> crop , resize, add text overlay, format, headshot

* video
best frames extractor
concat -> one input from the builder() and others from method
yt downloader
option for converting the output type as well in video

* workflows -> get as json

### Issue with mp4
We can't stream mp4 (can't use pipe:1) as a result we need to get the video first
So either we need this "+frag_keyframe+empty_moov" which makes it feel like a live stream
Or use a matroska format

Idea is to always output a matroska format and then transcode that to mp4

### FFMPEG guide
http://img.ly/blog/ultimate-guide-to-ffmpeg/
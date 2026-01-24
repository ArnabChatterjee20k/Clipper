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
* User will be able to create their workflows and save them in the yaml file or in the db with the steps mentioned

### FFMPEG guide
http://img.ly/blog/ultimate-guide-to-ffmpeg/
# About
A MVP of an editor for locally editing medias via http request

# Tech
db -> postgres  
queue -> postgres only since everything would be step actions
server -> python fastapi
tools -> ffmpeg and imagegick
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
* An editing will be a session and each edit will create a new file so that we can go back and forth
* Every edit requests will be queued and will be assigned an id to be queried against

# TODO
A command registration system for builidng commands via a cms
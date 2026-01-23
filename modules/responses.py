from pydantic import BaseModel


class FileResponse(BaseModel):
    type: str
    filename: str

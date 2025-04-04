import os
import time
import psutil
from safetensors import safe_open

LLM_MODEL_NAME = "meta-llama/Llama-2-7b-chat-hf"
EMBEDDING_MODEL_NAME = "sentence-transformers/multi-qa-MiniLM-L6-cos-v1"

model_directory = "Models/llama_3_model"
pdf_directory = "Data/Training/PDFS"

showMessage = True

# Function to print the current time and a message
def log_time(message):
    if showMessage:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}")


# Function to check memory usage
def check_memory_usage(threshold=80):
    memory = psutil.virtual_memory()
    return memory.percent < threshold
  
  
def verify_model():
    # List all safetensor files
    shard_files = [
        "model-00001-of-00006.safetensors",
        "model-00002-of-00006.safetensors",
        "model-00003-of-00006.safetensors",
        "model-00004-of-00006.safetensors",
        "model-00005-of-00006.safetensors",
        "model-00006-of-00006.safetensors",
    ]

    # Try loading each shard separately
    for shard in shard_files:
        shard_path = f"{model_directory}/{shard}"
        try:
            # Attempt to load the shard
            with safe_open(shard_path, framework="pt") as f:
                print(f"{shard} loaded successfully.")
        except Exception as e:
            print(f"Failed to load {shard}: {e}")


def count_pdfs_in_folder(folder_path):
    total_pdfs = 0

    for root, dirs, files in os.walk(folder_path):
        pdf_count = len([file for file in files if file.lower().endswith('.pdf')])
        total_pdfs += pdf_count
        print(f"Found {pdf_count} PDFs in {root}")

    return total_pdfs

    # # Example usage:
    # folder_path = 'papers/'  # replace with the path to your papers folder
    # total_pdfs = count_pdfs_in_folder(folder_path)
    # print(f"Total number of PDF documents: {total_pdfs}")
    

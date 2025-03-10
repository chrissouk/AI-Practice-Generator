import os
import sys
import time
import logging
import faiss
import numpy as np
import pickle
from langchain.embeddings import HuggingFaceEmbeddings
from llama_index.llms.huggingface import HuggingFaceLLM
from llama_index.core import ServiceContext
from llama_index.core import SimpleDirectoryReader
from langchain_community.embeddings import HuggingFaceEmbeddings
from utils import model_directory, pdf_directory, log_time, check_memory_usage, LLM_MODEL_NAME, EMBEDDING_MODEL_NAME

# Function to find all PDF files in a directory and its subdirectories
def find_all_pdfs(directory):
    pdf_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.pdf'):
                pdf_files.append(os.path.join(root, file))
                # print(f"Found PDF file: {os.path.join(root, file)}")
    return pdf_files

def read_documents():
    # Specify the directory containing the papers
    papers_directory = pdf_directory
    
    logging.basicConfig(stream=sys.stdout, level=logging.INFO)
    logging.getLogger().addHandler(logging.StreamHandler(stream=sys.stdout))

    # Get a list of all PDF files in the directory and its subdirectories
    pdf_files = find_all_pdfs(papers_directory)

    # Initialize the documents list
    documents = []

    # Batch size for processing PDF files
    batch_size = 10

    # Process PDF files in batches
    for i in range(0, len(pdf_files), batch_size):
        batch = pdf_files[i:i+batch_size]
        for pdf_file in batch:
            try:
                reader = SimpleDirectoryReader(input_dir=os.path.dirname(pdf_file), required_exts=".pdf").load_data()
                documents.extend(reader)
            except Exception as e:
                logging.warning(f"Failed to read {pdf_file}: {e}")
    return documents

documents = read_documents()

def save_embedding_model(documents):

    embeddings_model = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL_NAME)

    # Extract text from documents
    texts = [doc.text for doc in documents]

    # Generate embeddings for the texts
    embeddings = [embeddings_model.embed_query(text) for text in texts]
    embeddings_array = np.array(embeddings)

    # Initialize FAISS index
    dimension = embeddings_array.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings_array)

    faiss.write_index(index, 'Models/llama_3_model/vector_index/index.faiss')
    np.save('Models/llama_3_model/responses.npy', texts)
    
    return embeddings_model

save_embedding_model(documents)

def load_embedding_model():
    # Load FAISS index and responses
    try:
        logging.info("Loading vector index from pickle...")

        # Load the vector index using pickle
        with open('Models/llama_3_model/vector_index/index.pkl', 'rb') as f:
            index = pickle.load(f)

        # Load responses
        responses = np.load('Models/responses_small.npy', allow_pickle=True)
        logging.info("Vector index and responses loaded successfully.")
        return index, responses
    except Exception as e:
        logging.error(f"Failed to load vector index: {e}")
        return None, None

def find_best_response(text, embeddings_model, index, responses):
    # Generate embedding for the input text
    embedding = np.array(embeddings_model.embed_query(text)).reshape(1, -1)
    # print(embedding)
    
    # Query the FAISS index
    D, I = index.search(embedding, 1)  # Retrieve top 1 most similar embedding
    best_response = responses[I[0][0]]
    return best_response


# Generate answer from context:
def generate_response_from_context(model, tokenizer, question, context):
    try:
        log_time("Tokenizing input...")

        input_text = f"Question: {question}\nContext: {context}"
        inputs = tokenizer(input_text, return_tensors="pt")
        log_time("Input tokenized.")

        log_time("Generating response...")
        start_time = time.time()

        output = model.generate(
            input_ids=inputs["input_ids"],
            attention_mask=inputs["attention_mask"],
            max_new_tokens=512,
            pad_token_id=tokenizer.eos_token_id,
        )
        end_time = time.time()
        log_time(f"Response generated in {end_time - start_time:.2f} seconds.")

        log_time("Decoding response...")
        response = tokenizer.decode(output[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
        log_time("Response decoded.")

        return response
    except Exception as e:
        print(e)
        log_time(f"Failed to generate response: {e}")
        return None

# # Initialize everything from run_model.py
# model_dir = "./models/"
# model, tokenizer, embedding_model, llm_config, llm = initialize_all(model_dir)
# index, responses = load_embedding_model()

# def main():
#     # Example usage
#     # input_text = "According to the World Health Organization (WHO), noncommunicable diseases (NCDs) kill how many people anually?"
#     # input_text = "What are some wearable devices that can be used to detect AFib?"
#     # input_text = "If a patient's fasting blood glucose levels are 120 mg/dl, how likely is it that they have diabetes?"
#     # input_text = "How are Convolutional Neural Networks used in predicting blood glucose levels?"
#     # input_text = "What is mitochondrial dysfunction and how can you prevent it?"
#     # input_text = "Explain in simple terms: What is DAE-ConvBiLSTM?"

#     while True:
#         input_text = input("Enter your question or type 'exit' to quit: ")
#         if input_text == 'exit':
#             break
#         print(input_text)
#         best_context = find_best_response(input_text, embedding_model, index, responses)
#         print("Context: " + best_context)
#         response = generate_response_from_context(model, tokenizer, input_text, best_context)
#         print("Answer: " + response)
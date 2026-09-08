use std::env;
use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    println!("args={}", env::args().skip(1).collect::<Vec<_>>().join(","));
    print!("stdin={input}");
    eprintln!("stderr=ready");
}


#include <iostream>
#include <vector>
using namespace std;

// int factorialofN(int n){
//     if(n==0 || n==1){
//         return 1;
//     }
//     return n*factorialofN(n-1);
// }

// int finalAnswer(int n,int r){
//     return factorialofN(n)/(factorialofN(r)*factorialofN(n-r));
// }

//Checking If number is prime or Not
// bool CheckingIfPrime(int n){
//     if(n==0 || n==1){
//         return false;
//     }
//     int sum=0;
//     for(int i=2;i<=n;i++){
//         if(n%i==0){ 
//             sum++;
//         }
// }
// if(sum>1){
//     return false;
// }else{
//     return true;
// }
// }


//Printing all Prime Numbers from 2 to n;


int main(){
    
int a;
cout<<"Enter a number: ";
cin>>a;
vector<int>ReversedNumber;
while(a>0){
    int lastDigit = a%10;
    ReversedNumber.push_back(lastDigit);
    a/=10;

}
for(auto j : ReversedNumber){
    cout<<j;
}
    return 0;
}